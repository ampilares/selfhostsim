# 1. Firebase Messaging rules
-keep class com.google.firebase.** { *; }-dontwarn com.google.firebase.**

# 2. GSON rules (Crucial for your API calls)
-keepattributes Signature
-keepattributes *Annotation*
-keep class com.google.gson.** { *; }
-keep class com.squareup.retrofit2.** { *; }

# 3. Protect your Data Models
# IMPORTANT: Replace 'com.amp.sms' with your actual model package name
-keep class com.amp.sms.models.** { *; }

# 4. ZXing QR Scanner
-keep class com.journeyapps.barcodescanner.** { *; }
-keep class com.google.zxing.** { *; }
