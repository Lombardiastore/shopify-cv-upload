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

// ==================== UPLOAD ROUTE ====================
app.post("/upload", upload.single("cv"), async (req, res) => {
  const filePath = req.file.path;

  try {
    // 1. Upload file to Drive
    const response = await drive.files.create({
      requestBody: {
        name: req.file.originalname,
        mimeType: req.file.mimetype,
      },
      media: {
        mimeType: req.file.mimetype,
        body: fs.createReadStream(filePath),
      },
    });

    const fileId = response.data.id;

    // 2. Make file public
    await drive.permissions.create({
      fileId: fileId,
      requestBody: { role: "reader", type: "anyone" },
    });

    const fileLink = `https://drive.google.com/file/d/${fileId}/view`;

    // 3. Send Email
    const transporter = nodemailer.createTransport({
      host: "smtp.office365.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: `"Lombardia HR" <${process.env.SMTP_USER}>`,
      to: "hr@lombardia.com.jo",
      subject: "طلب توظيف جديد - مع CV",
      html: `
        <p><b>الاسم:</b> ${req.body.fullName}</p>
        <p><b>الإيميل:</b> ${req.body.email}</p>
        <p><b>الهاتف:</b> ${req.body.phone}</p>
        <p><b>الوظيفة:</b> ${req.body.position}</p>
        <p><b>ملاحظات:</b> ${req.body.notes || "لا يوجد"}</p>
        <p><b>📎 CV:</b> <a href="${fileLink}">اضغط هنا</a></p>
      `,
    });

    res.send(`تم رفع الملف بنجاح! <a href="${fileLink}">فتح الملف</a>`);
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ خطأ في رفع الملف أو إرسال الإيميل");
  } finally {
    fs.unlinkSync(filePath); // حذف الملف بعد الرفع
  }
});

// ==================== SERVER LISTEN ====================
app.listen(3000, () => console.log("🚀 Server running on port 3000"));
