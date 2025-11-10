import { google } from "googleapis";
import readline from "readline";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const SCOPES = ["https://www.googleapis.com/auth/drive.file"];

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: "offline",
  scope: SCOPES,
  prompt: "consent",
});

console.log("\n✅ افتح الرابط التالي في المتصفح وسجّل دخولك بحساب Google Drive اللي فيه المجلد:");
console.log(authUrl);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("\n📥 انسخ الكود اللي ظهر بعد الموافقة وضعه هنا: ", async (code) => {
  try {
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    fs.writeFileSync("token.json", JSON.stringify(tokens, null, 2));
    console.log("\n✅ تم إنشاء token.json بنجاح! مش رح تحتاج تعيد هاي الخطوة مرة ثانية 🎉");
  } catch (err) {
    console.error("❌ خطأ في توليد التوكن:", err);
  } finally {
    rl.close();
  }
});
