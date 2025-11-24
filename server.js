import express from "express";
import multer from "multer";
import fs from "fs";
import { google } from "googleapis";
import dotenv from "dotenv";
import fetch from "node-fetch";
import nodemailer from "nodemailer"; // ✅ هنا فوق

dotenv.config();

const app = express();
const upload = multer({ dest: "uploads/" });
app.use(express.urlencoded({ extended: true }));
app.use(express.json());



// ==================== GOOGLE SERVICE ACCOUNT AUTH ====================
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, "shopify-cv-uploader-fe2532dda344.json"), // اسم ملف JSON
  scopes: [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/gmail.send",
  ],
});

const drive = google.drive({ version: "v3", auth });
const gmail = google.gmail({ version: "v1", auth });


// helper لتأمين النص داخل HTML
const esc = (s) =>
  (s ?? "")
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// ==================== UPLOAD ROUTE ====================
app.post("/upload", upload.single("cv"), async (req, res) => {
  if (!req.file) return res.status(400).send("❌ لم يتم إرفاق ملف CV");

  // ✅ أرسل الرد فورًا للمستخدم
  res.send("✅ تم استلام طلبك بنجاح، سيتم رفع الملف ومعالجته خلال لحظات...");

  // 🧠 السيرفر يكمل بعد الرد بالخلفية
  setImmediate(async () => {
    const f = (x) => (x ?? "").toString().trim();
    const data = {
      fullName: f(req.body.fullName) || "Applicant",
      email: f(req.body.email),
      phone: f(req.body.phone),
      position: f(req.body.position) || "وظيفة غير محددة",
      maritalStatus: f(req.body.maritalStatus),
      nationality: f(req.body.nationality),
      nationalNo: f(req.body.nationalNo),
      dob: f(req.body.dob),
      address: f(req.body.address),
      education: f(req.body.education),
      student: f(req.body.student),
      workedBefore: f(req.body.workedBefore),
      notes: f(req.body.notes) || "لا يوجد",
    };

    console.log("Incoming form:", { ...data, file: req.file });
    const filePath = req.file.path;
    let fileLink = null;

    // 1️⃣ رفع الملف إلى Google Drive
    try {
      const up = await drive.files.create({
  requestBody: {
    name: req.file.originalname,
    parents: [process.env.FOLDER_ID], // فولدر ثابت
  },
  media: {
    mimeType: req.file.mimetype,
    body: fs.createReadStream(filePath),
  },
  fields: "id",
});

      const fileId = up.data.id;
      await drive.permissions.create({
        fileId,
        requestBody: { role: "reader", type: "anyone" },
      });

      fileLink = `https://drive.google.com/file/d/${fileId}/view`;
      console.log("✅ Uploaded to Drive:", fileLink);
    } catch (e) {
      console.error("❌ Drive upload error:", e?.response?.data || e);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return;
    } finally {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    // ✅ نبني صفوف الجدول للإيميل
    const rows = [
      ["الاسم", data.fullName],
      ["الإيميل", data.email || "-"],
      ["الهاتف", data.phone || "-"],
      ["الوظيفة", data.position],
      ["الحالة الاجتماعية", data.maritalStatus || "-"],
      ["الجنسية", data.nationality || "-"],
      ["الرقم الوطني", data.nationalNo || "-"],
      ["تاريخ الميلاد", data.dob || "-"],
      ["العنوان", data.address || "-"],
      ["المؤهل العلمي", data.education || "-"],
      ["هل أنت طالب؟", data.student || "-"],
      ["هل عملت لدينا سابقاً؟", data.workedBefore || "-"],
      ["ملاحظات", data.notes || "-"],
      ["CV", `<a href="${fileLink}">اضغط هنا</a>`],
    ]
      .map(
        ([k, v]) => `
          <tr>
            <td style="padding:10px;border:1px solid #eee;background:#faf7f2;">${esc(k)}</td>
            <td style="padding:10px;border:1px solid #eee;">${v}</td>
          </tr>`
      )
      .join("");


// 2️⃣ إرسال الإيميل عبر Gmail API مباشرةً بدون SMTP
try {
  const subject = `${data.position} - ${data.fullName} - طلب توظيف`;
  const body = `
    <div style="font-family:Tahoma,Arial,sans-serif;font-size:15px;color:#222">
      <h2 style="margin:0 0 7px;color:#9E7A47;">طلب توظيف جديد</h2>
      <table style="border-collapse:collapse;min-width:540px">${rows}</table>
    </div>`;

  // نبني الإيميل بصيغة base64
  const messageParts = [
    `From: Lombardia Careers <${process.env.SMTP_USER}>`,
    `To: Waleed.Khaled@lombardia.com.jo`,
    `Cc: hr@lombardia.com.jo`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "",
    body,
  ];

  const message = messageParts.join("\n");
  const encodedMessage = Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  await gmail.users.messages.send({
    userId:
      "shopify-cv-uploader@shopify-cv-uploader.iam.gserviceaccount.com",
    requestBody: { raw: encodedMessage },
  });

  console.log("📧 Email sent via Gmail API ✅");
} catch (e) {
  console.error("❌ Gmail API error:", e?.response?.data || e);
}



  });
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

// 🔄 Keep Render awake
const SELF_PING_URL = "https://shopify-cv-upload.onrender.com";
setInterval(() => {
  fetch(SELF_PING_URL)
    .then(() => console.log("⏳ Keep-alive ping sent to self"))
    .catch((err) => console.error("⚠️ Keep-alive ping failed:", err.message));
}, 60 * 1000);
