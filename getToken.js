import express from "express";
import fs from "fs";
import { google } from "googleapis";

const app = express();
const port = 3000;

// جلب client_id, client_secret, redirect_uri من ملف credentials.json
const credentials = JSON.parse(fs.readFileSync("credentials.json"));
const { client_id, client_secret, redirect_uris } = credentials.web;  // ✅ استعمل web بدل installed
const oAuth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  redirect_uris[0] // ✅ خذ أول redirect_uri من الملف
);

// استقبال الكود من Google
app.get("/oauth2callback", async (req, res) => {
  const code = req.query.code;
  try {
    const { tokens } = await oAuth2Client.getToken(code);
    fs.writeFileSync("token.json", JSON.stringify(tokens));
    res.send("✅ تم تخزين التوكن بنجاح! تقدر تسكر هالصفحة.");
    console.log("✅ Access Token saved to token.json");
  } catch (err) {
    console.error("Error retrieving access token", err);
    res.send("❌ فشل الحصول على التوكن.");
  }
});

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: "offline",
  scope: ["https://www.googleapis.com/auth/drive.file"],
});
console.log("✅ افتح الرابط التالي بالمتصفح واعمل سماح:");
console.log(authUrl);


app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
