import express from "express";
import multer from "multer";
import fs from "fs";
import { google } from "googleapis";
import nodemailer from "nodemailer";

const app = express();
const upload = multer({ dest: "uploads/" });

// parse form fields
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ==================== GOOGLE DRIVE AUTH ====================
const client_id = process.env.CLIENT_ID;
const client_secret = process.env.CLIENT_SECRET;
const redirect_uris = [process.env.REDIRECT_URI];
const token = JSON.parse(process.env.TOKEN);

const oAuth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  redirect_uris[0]
);
oAuth2Client.setCredentials(token);

const drive = google.drive({ version: "v3", auth: oAuth2Client });

// 🟢 Upload Route (أدق برسائل الخطأ)
app.post("/upload", upload.single("cv"), async (req, res) => {
  if (!req.file) {
    console.error("No file received");
    return res.status(400).send("❌ لم يتم إرفاق ملف CV");
  }

  const filePath = req.file.path;
  console.log("Incoming form:", {
    fullName: req.body.fullName,
    email: req.body.email,
    phone: req.body.phone,
    position: req.body.position,
    notes: req.body.notes,
    file: { name: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size }
  });

  let fileLink = null;

  try {
    // 1) رفع الملف على Drive
    const up = await drive.files.create({
      requestBody: { name: req.file.originalname, mimeType: req.file.mimetype },
      media: { mimeType: req.file.mimetype, body: fs.createReadStream(filePath) },
    });
    const fileId = up.data.id;

    await drive.permissions.create({
      fileId, requestBody: { role: "reader", type: "anyone" },
    });

    fileLink = `https://drive.google.com/file/d/${fileId}/view`;
    console.log("Uploaded to Drive:", fileLink);
  } catch (e) {
    console.error("Drive upload error:", e?.response?.data || e);
    fs.existsSync(filePath) && fs.unlinkSync(filePath);
    return res.status(500).send("❌ خطأ في رفع الملف إلى Google Drive");
  } finally {
    // نظافة محلية
    fs.existsSync(filePath) && fs.unlinkSync(filePath);
  }

  // 2) محاولة إرسال الإيميل — لو فشل، نرجع اللينك برضه
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.office365.com",
      port: 587,
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });

    await transporter.sendMail({
      from: '"Lombardia HR" <' + process.env.SMTP_USER + '>',
      to: "hr@lombardia.com.jo",
      subject: "طلب توظيف جديد - مع CV",
      html: `
        <p><b>الاسم:</b> ${req.body.fullName || "-"}</p>
        <p><b>الايميل:</b> ${req.body.email || "-"}</p>
        <p><b>الهاتف:</b> ${req.body.phone || "-"}</p>
        <p><b>الوظيفة:</b> ${req.body.position || "-"}</p>
        <p><b>ملاحظات:</b> ${req.body.notes || "لا يوجد"}</p>
        <p><b>📎 CV:</b> <a href="${fileLink}">اضغط هنا</a></p>
      `
    });

    console.log("Email sent OK");
    return res.send(`✅ تم رفع الملف بنجاح! <a href="${fileLink}">فتح الملف</a>`);
  } catch (e) {
    console.error("Email error:", e);
    // برضه نرجع لينك الملف حتى لو الإيميل فشل
    return res
      .status(200)
      .send(`✅ الملف مرفوع، لكن تعذّر إرسال الإيميل حالياً. هذا رابط الملف: <a href="${fileLink}">فتح الملف</a>`);
  }
});

// ==================== SERVER LISTEN ====================
app.listen(3000, () => console.log("🚀 Server running on port 3000"));
