require('dotenv').config();
const express = require('express');
const path = require('path')
const _ = require('lodash');
const { HighLevel, MongoDBSessionStorage, LogLevel } = require('@gohighlevel/api-client');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const { ensureContactId } = require('./lib/contacts');
const { ensureConversationId } = require('./lib/conversations');
const { addInboundSmsMessage } = require('./lib/inbound-message');

const PORT = process.env.PORT || 3002;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const WEBHOOK_PUBLIC_KEY = process.env.WEBHOOK_PUBLIC_KEY;

// Timestamp validation constants for inbound SMS
const MAX_TIMESTAMP_FUTURE_MS = 60 * 60 * 1000; // 1 hour - allow for clock skew
const MAX_TIMESTAMP_PAST_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const sessionStorage = new MongoDBSessionStorage(
  process.env.MONGO_URL,
  process.env.MONGO_DB_NAME,
  process.env.COLLECTION_NAME
);

const ghl = new HighLevel({
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
  sessionStorage,
  logLevel: LogLevel.DEBUG
});

const app = express();
app.set('trust proxy', process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true');

// Set up Pug as view engine
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

const checkEnv = (req, res, next) => {
  if (_.startsWith(req.url, '/error-page')) return next();

  if (
    _.isNil(CLIENT_ID) ||
    _.isEmpty(CLIENT_ID)
  )
    return res.redirect(
      '/error-page?msg=Please set CLIENT_ID env variable to proceed'
    );

  if (
    _.isNil(CLIENT_SECRET) ||
    _.isEmpty(CLIENT_SECRET)
  )
    return res.redirect(
      '/error-page?msg=Please set CLIENT_SECRET env variable to proceed'
    );

    if (
      _.isNil(WEBHOOK_PUBLIC_KEY) ||
      _.isEmpty(WEBHOOK_PUBLIC_KEY)
    )
      return res.redirect(
        '/error-page?msg=Please set WEBHOOK_PUBLIC_KEY env variable to proceed'
      );

  next();
};

app.use(checkEnv);
app.use(bodyParser.json());

const verifyWebhookSignature = (req, _res, next) => {
  req.skippedSignatureVerification = false;
  req.isSignatureValid = false;

  const signature = req.headers['x-wh-signature'];
  if (signature && WEBHOOK_PUBLIC_KEY) {
    try {
      const payload = JSON.stringify(req.body);
      const verifier = crypto.createVerify('sha256');
      verifier.update(payload);
      verifier.end();

      req.isSignatureValid = verifier.verify(WEBHOOK_PUBLIC_KEY, signature, 'base64');
    } catch (err) {
      console.error('Error verifying webhook signature', err);
      req.isSignatureValid = false;
    }
  } else {
    req.skippedSignatureVerification = true;
  }

  next();
};

const webhookRouter = express.Router();

const requireInternalSecret = (req, res, next) => {
  const headerName = (
    process.env.GHL_INTERNAL_HEADER_NAME ||
    process.env.SELFHOSTSIM_INTERNAL_HEADER_NAME ||
    process.env.INTERNAL_API_KEY_HEADER_NAME ||
    'x-internal-secret'
  ).toLowerCase();
  const secret =
    process.env.GHL_INTERNAL_SECRET ||
    process.env.SELFHOSTSIM_INTERNAL_SECRET ||
    process.env.INTERNAL_SECRET;
  if (!secret) {
    return res.status(500).json({
      status: 'error',
      message:
        'Server not configured for internal auth (set GHL_INTERNAL_SECRET; or fallback SELFHOSTSIM_INTERNAL_SECRET / INTERNAL_SECRET)',
    });
  }

  const provided = req.headers[headerName];
  if (!provided || provided !== secret) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }

  return next();
};

const getApiForwardingConfig = ({ forwardPath, errorContext }) => {
  const baseUrl = process.env.SELFHOSTSIM_API_BASE_URL || process.env.API_BASE_URL
  const internalSecret =
    process.env.SELFHOSTSIM_INTERNAL_SECRET || process.env.INTERNAL_SECRET
  const internalHeaderName =
    process.env.SELFHOSTSIM_INTERNAL_HEADER_NAME ||
    process.env.INTERNAL_API_KEY_HEADER_NAME ||
    'x-internal-secret'

  if (!baseUrl || !internalSecret) {
    console.error(
      `Missing SELFHOSTSIM_API_BASE_URL or SELFHOSTSIM_INTERNAL_SECRET; cannot forward ${errorContext}`,
    )
    return null
  }

  const forwardUrl = new URL(
    forwardPath,
    baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`,
  ).toString()

  return { forwardUrl, internalSecret, internalHeaderName }
}

const forwardToApi = async ({ res, config, payload, errorContext }) => {
  const controller = new AbortController()
  const timeoutMs = Number(process.env.SELFHOSTSIM_FORWARD_TIMEOUT_MS || 8000)
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(config.forwardUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // Send using configured header name, plus common fallbacks for safety.
        [config.internalHeaderName]: config.internalSecret,
        'x-internal-secret': config.internalSecret,
        'x-internal-api-key': config.internalSecret,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    const responseText = await response.text().catch(() => '')
    if (!response.ok) {
      console.error(`Failed to forward ${errorContext}`, response.status, responseText)
      return res.status(502).json({
        status: 'error',
        message: `Failed to forward ${errorContext}`,
        upstreamStatus: response.status,
      })
    }

    return res.status(200).json({ status: 'success' })
  } catch (err) {
    console.error(`Error forwarding ${errorContext}`, err)
    return res.status(502).json({ status: 'error', message: 'Forward request failed' })
  } finally {
    clearTimeout(timeout)
  }
}

app.get('/', (req, res) => {
  res.render('index');
});

const getPublicBaseUrl = (req) => {
  const configured =
    process.env.GHL_PUBLIC_BASE_URL ||
    process.env.PUBLIC_BASE_URL ||
    process.env.SELFHOSTSIM_PUBLIC_BASE_URL;

  if (configured && String(configured).trim()) {
    return String(configured).replace(/\/$/, '');
  }

  const proto = req.protocol || 'http';
  const host = req.get('host');
  return `${proto}://${host}`;
};

const decodeJwtPayload = (jwt) => {
  if (!jwt || typeof jwt !== 'string') return null;
  const parts = jwt.split('.');
  if (parts.length < 2) return null;
  try {
    const payload = parts[1];
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const json = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch (_err) {
    return null;
  }
};

const getOauthScopesFromAccessToken = (accessToken) => {
  const payload = decodeJwtPayload(accessToken);
  const scopes = payload?.oauthMeta?.scopes || payload?.scope || payload?.scopes;
  if (!scopes) return [];
  if (Array.isArray(scopes)) return scopes.filter(Boolean);
  if (typeof scopes === 'string') return scopes.split(/\s+/).filter(Boolean);
  return [];
};

app.get('/install', (req, res) => {
  const redirectUri = `${getPublicBaseUrl(req)}/oauth-callback`;
  const redirectUrl = ghl.oauth.getAuthorizationUrl(
    CLIENT_ID,
    redirectUri,
    'contacts.readonly contacts.write locations.readonly conversations.readonly conversations.write conversations/message.write'
  );
  console.log('Redirect URL', redirectUrl);
  return res.redirect(redirectUrl);
});

app.get('/oauth-callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.redirect('/error-page?msg=No code provided');
  }
  try {
    const accessToken = await ghl.oauth.getAccessToken({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    });
    await ghl.getSessionStorage().setSession(accessToken.locationId, accessToken);
    res.render('token', {
      token: accessToken,
      locationId: accessToken.locationId,
    });
  } catch (err) {
    console.error('Error fetching token:', err);
    res.redirect('/error-page?msg=Error fetching token');
  }
});

app.get('/contact', async (req, res) => {
  try {
    // get all tokens for the application
    const allTokens = await ghl.getSessionStorage().getSessionsByApplication()
    if (!allTokens?.length) {
      return res.redirect('/error-page?msg=Please authorize the application to proceed');
    }
    // get the location token (if you have bulk installed the app, then all tokens will be stored in the database)
    const locationToken = allTokens.find(token => token.userType?.toLowerCase() === 'location')
    if (!locationToken) {
      return res.redirect('/error-page?msg=Please authorize the application to proceed');
    }
    const locationId = locationToken.locationId
    const location = await ghl.locations.getLocation(
      {
        locationId
      },
      {
        preferredTokenType: 'location'
      }
    )
    if (!location?.location) {
      return res.redirect('/error-page?msg=No location found');
    }
    console.log('Location here:', location.location);
    const contacts = await ghl.contacts.getContacts(
      {
        locationId,
        limit: 5
      },
    );
    console.log('Fetched contacts:', contacts.contacts);
    const contactId = contacts.contacts[0].id;
    if (!contactId) {
      return res.redirect('/error-page?msg=No contact found');
    } 
    const contact = await ghl.contacts.getContact(
      {
        contactId
      },
      {
        headers: {
          locationId // need to pass locationId here so that SDK can fetch the token for the location (as it is not part of body or query parameter)
        },
      }
    );
    console.log('Contact here:', contact.contact);
    return res.render('contact', {
      contact: contact?.contact,
    });
  } catch (error) {
    console.error('Error fetching contact:', error);
    res.redirect('/');
  }
});

app.get('/refresh-token', async (req, res) => {
  try {
    const resourceId = req.query.resourceId;
    if (!resourceId) {
      return res.redirect('/error-page?msg=No resourceId provided');
    }
    const tokenDetails = await ghl.getSessionStorage().getSession(resourceId);
    if (!tokenDetails) {
      return res.redirect('/error-page?msg=No token found');
    }
    const token = await ghl.oauth.refreshToken(
      tokenDetails.refresh_token,
      CLIENT_ID,
      CLIENT_SECRET,
      'refresh_token',
      tokenDetails.userType
    );
    await ghl.getSessionStorage().setSession(resourceId, token);
    res.render('token', {
      token: token,
      locationId: resourceId,
    });
  } catch (error) {
    console.error('Error refreshing token:', error);
    res.redirect('/error-page?msg=Error refreshing token');
  }
});

webhookRouter.post('/messages', verifyWebhookSignature, async (req, res) => {
  if (!req.skippedSignatureVerification && !req.isSignatureValid) {
    return res.status(401).json({ status: 'error', message: 'Invalid webhook signature' })
  }

  const payload = req.body || {}
  const missing = []

  if (!payload.locationId || typeof payload.locationId !== 'string') missing.push('locationId')
  if (!payload.type || typeof payload.type !== 'string') missing.push('type')
  if (!payload.phone || typeof payload.phone !== 'string') missing.push('phone')
  if (!payload.message || typeof payload.message !== 'string') missing.push('message')
  if (!payload.contactId || typeof payload.contactId !== 'string') missing.push('contactId')

  if (missing.length) {
    return res
      .status(400)
      .json({ status: 'error', message: `Missing/invalid fields: ${missing.join(', ')}` })
  }

  const config = getApiForwardingConfig({
    forwardPath: 'internal/ghl/provider-outbound-message',
    errorContext: 'provider outbound message',
  })
  if (!config) {
    return res
      .status(500)
      .json({ status: 'error', message: 'Server not configured for forwarding' })
  }

  return forwardToApi({
    res,
    config,
    payload,
    errorContext: 'provider outbound message',
  })
});

// For all non-provider-message webhooks, use the SDK middleware (it expects `appId` in the payload).
webhookRouter.use(ghl.webhooks.subscribe());

webhookRouter.post('/', (req, res) => {
  console.log('signature verified', req.isSignatureValid)
  return res.status(200).json({ status: 'success' });
});

webhookRouter.post('/inbound-message', (req, res) => {
  console.log(req.body)
  return res.status(200).json({ status: 'success' });
});

webhookRouter.post('/outbound-message', verifyWebhookSignature, async (req, res) => {
  if (!req.skippedSignatureVerification && !req.isSignatureValid) {
    return res.status(401).json({ status: 'error', message: 'Invalid webhook signature' })
  }

  const payload = req.body || {}
  const missing = []

  if (!payload.locationId || typeof payload.locationId !== 'string') missing.push('locationId')
  if (!payload.contactId || typeof payload.contactId !== 'string') missing.push('contactId')
  if (!payload.conversationId || typeof payload.conversationId !== 'string') missing.push('conversationId')

  if (missing.length) {
    return res
      .status(400)
      .json({ status: 'error', message: `Missing/invalid fields: ${missing.join(', ')}` })
  }

  const config = getApiForwardingConfig({
    forwardPath: 'internal/ghl/outbound-message',
    errorContext: 'outbound message',
  })
  if (!config) {
    return res
      .status(500)
      .json({ status: 'error', message: 'Server not configured for forwarding' })
  }

  return forwardToApi({
    res,
    config,
    payload,
    errorContext: 'outbound message',
  })
});

app.use('/api/ghl/v1/webhook', webhookRouter);

app.get('/api/ghl/v1/internal/token-status/:locationId', requireInternalSecret, async (req, res) => {
  const locationId = req.params.locationId;
  if (!locationId) return res.status(400).json({ status: 'error', message: 'locationId is required' });

  try {
    const session = await ghl.getSessionStorage().getSession(locationId);
    if (!session) {
      return res.status(404).json({
        status: 'error',
        message: 'No token found for locationId',
        locationId,
        authorizeUrl: `${process.env.GHL_PUBLIC_BASE_URL || ''}/install`,
      });
    }

    const scopes = getOauthScopesFromAccessToken(session.access_token);
    const requiredScopes = [
      'contacts.readonly',
      'contacts.write',
      'conversations.readonly',
      'conversations.write',
      'conversations/message.write',
    ];
    const missingScopes = requiredScopes.filter((scope) => !scopes.includes(scope));

    return res.status(200).json({
      status: 'ok',
      locationId,
      userType: session.userType,
      hasAccessToken: Boolean(session.access_token),
      hasRefreshToken: Boolean(session.refresh_token),
      expireAt: session.expire_at || null,
      scopes,
      missingScopes,
    });
  } catch (err) {
    console.error('Failed checking token status', err);
    return res.status(500).json({ status: 'error', message: 'Failed checking token status' });
  }
});

app.post('/api/ghl/v1/internal/inbound-sms', requireInternalSecret, async (req, res) => {
  try {
    const payload = req.body || {};
    const locationId = String(payload.locationId || '').trim();
    const sender = payload.sender;
    const message = payload.message;
    const receivedAtInMillis = payload.receivedAtInMillis;
    const correlationId = payload.correlationId;
    const providedConversationId = payload.conversationId;

    if (!locationId || typeof locationId !== 'string') {
      return res.status(400).json({ status: 'error', message: 'locationId is required' });
    }
    if (!sender || typeof sender !== 'string') {
      return res.status(400).json({ status: 'error', message: 'sender is required' });
    }
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ status: 'error', message: 'message is required' });
    }
    if (!receivedAtInMillis || typeof receivedAtInMillis !== 'number') {
      return res.status(400).json({ status: 'error', message: 'receivedAtInMillis is required' });
    }
    // Validate timestamp is within reasonable bounds
    if (receivedAtInMillis < 0) {
      return res.status(400).json({ status: 'error', message: 'receivedAtInMillis must be a non-negative timestamp' });
    }
    const now = Date.now();
    const oneHourInFuture = now + MAX_TIMESTAMP_FUTURE_MS;
    const thirtyDaysInPast = now - MAX_TIMESTAMP_PAST_MS;
    if (receivedAtInMillis > oneHourInFuture) {
      return res.status(400).json({ status: 'error', message: 'receivedAtInMillis cannot be more than 1 hour in the future' });
    }
    if (receivedAtInMillis < thirtyDaysInPast) {
      return res.status(400).json({ status: 'error', message: 'receivedAtInMillis cannot be more than 30 days in the past' });
    }

    const conversationProviderId = process.env.GHL_CONVERSATION_PROVIDER_ID;
    if (!conversationProviderId) {
      return res.status(500).json({ status: 'error', message: 'Missing GHL_CONVERSATION_PROVIDER_ID' });
    }

    const token = await ghl.getSessionStorage().getSession(locationId);
    if (!token?.access_token) {
      console.warn('Inbound SMS rejected: no token for locationId', { locationId });
      return res.status(424).json({
        status: 'error',
        message:
          'No OAuth token available for this locationId. Authorize the GHL app (visit /install and complete OAuth) so tokens are stored in MongoDB.',
        locationId,
      });
    }

    const scopes = getOauthScopesFromAccessToken(token.access_token);
    const requiredScopes = [
      'contacts.readonly',
      'contacts.write',
      'conversations.readonly',
      'conversations.write',
      'conversations/message.write',
    ];
    const missingScopes = requiredScopes.filter((scope) => !scopes.includes(scope));
    if (missingScopes.length) {
      console.warn('Inbound SMS rejected: token missing required scopes', {
        locationId,
        missingScopes,
        scopes,
      });
      return res.status(424).json({
        status: 'error',
        message:
          'OAuth token is missing required scopes for inbound SMS (re-authorize the app via /install after adding scopes in the GHL app settings).',
        locationId,
        missingScopes,
        scopes,
      });
    }

    const { contactId, normalizedPhone } = await ensureContactId({
      ghl,
      locationId,
      phone: sender,
    });

    const conversationId = providedConversationId || (await ensureConversationId({ ghl, locationId, contactId }));

    const inbound = await addInboundSmsMessage({
      ghl,
      locationId,
      conversationId,
      conversationProviderId,
      message,
      date: new Date(receivedAtInMillis).toISOString(),
      altId: correlationId || undefined,
    });

    // Validate GHL API response structure
    if (!inbound.messageId) {
      console.error('GHL API response missing messageId', {
        success: inbound.success,
        hasContactId: !!inbound.contactId,
        hasConversationId: !!inbound.conversationId,
        expectedContactId: contactId,
        expectedConversationId: conversationId,
      });
      throw new Error('Invalid GHL API response: missing messageId');
    }

    // Log warnings if response structure deviates from expectations
    if (inbound.contactId && inbound.contactId !== contactId) {
      console.warn('GHL API returned different contactId than expected', {
        expected: contactId,
        received: inbound.contactId,
        messageId: inbound.messageId,
      });
    }

    if (inbound.conversationId && inbound.conversationId !== conversationId) {
      console.warn('GHL API returned different conversationId than expected', {
        expected: conversationId,
        received: inbound.conversationId,
        messageId: inbound.messageId,
      });
    }

    // Use response values if provided, otherwise fall back to our values with explicit logging
    const finalContactId = inbound.contactId || contactId;
    const finalConversationId = inbound.conversationId || conversationId;

    if (!inbound.contactId) {
      console.warn('GHL API response missing contactId, using local value', {
        contactId: finalContactId,
        messageId: inbound.messageId,
      });
    }

    if (!inbound.conversationId) {
      console.warn('GHL API response missing conversationId, using local value', {
        conversationId: finalConversationId,
        messageId: inbound.messageId,
      });
    }

    return res.status(202).json({
      status: 'accepted',
      data: {
        contactId: finalContactId,
        conversationId: finalConversationId,
        messageId: inbound.messageId,
        normalizedPhone,
      },
    });
  } catch (err) {
    console.error('Failed to record inbound sms', err);
    return res.status(500).json({ status: 'error', message: 'Failed to record inbound sms' });
  }
});

app.use('/error-page', (req, res) => {
  res.render('error', {
    error: req.query.msg,
  });
});

const validateRequiredEnv = () => {
  const required = [
    'CLIENT_ID',
    'CLIENT_SECRET',
    'WEBHOOK_PUBLIC_KEY',
    'MONGO_URL',
    'MONGO_DB_NAME',
  ];

  const missing = required.filter((key) => !process.env[key] || String(process.env[key]).trim() === '');
  if (missing.length) {
    throw new Error(`Missing required env var(s): ${missing.join(', ')}`);
  }
};

let server;

const start = async () => {
  validateRequiredEnv();

  await sessionStorage.init();

  server = app.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));
};

const shutdown = async (reason) => {
  let exitCode = 0;
  try {
    console.log(`Shutting down (${reason})...`);

    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await sessionStorage.disconnect();
  } catch (err) {
    console.error('Error during shutdown', err);
    exitCode = 1;
  } finally {
    process.exit(exitCode);
  }
};

process.on('SIGINT', () => shutdown('SIGINT').catch((err) => {
  console.error('Error during shutdown:', err);
  process.exit(1);
}));
process.on('SIGTERM', () => shutdown('SIGTERM').catch((err) => {
  console.error('Error during shutdown:', err);
  process.exit(1);
}));

start().catch((err) => {
  console.error('Failed to start selfhostsim-ghl', err);
  console.error(
    'Tip: if running under Docker Compose, MONGO_URL must use the Mongo container hostname (e.g. mongodb://adminUser:adminPassword@selfhostsim-db:27017/?authSource=admin), not localhost.'
  );
  process.exit(1);
});
