import express from "express";
import multer from "multer";
import fs from "fs";
import { google } from "googleapis";
import nodemailer from "nodemailer";

const app = express();
const upload = multer({ dest: "uploads/" });

// عشان يقرأ بيانات الفورم (غير الملف)
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Google Drive Auth
const credentials = JSON.parse(fs.readFileSync("credentials.json"));
const token = JSON.parse(fs.readFileSync("token.json"));

const { client_secret, client_id, redirect_uris } = credentials.installed;
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
oAuth2Client.setCredentials(token);

const drive = google.drive({ version: "v3", auth: oAuth2Client });

// 🟢 Upload Route
app.post("/upload", upload.single("cv"), async (req, res) => {
  const filePath = req.file.path;

  try {
    // Upload to Drive
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

    // Share link
    await drive.permissions.create({
      fileId: fileId,
      requestBody: { role: "reader", type: "anyone" },
    });

    const fileLink = `https://drive.google.com/file/d/${fileId}/view`;

    // 🟢 Send Email with Nodemailer
    const transporter = nodemailer.createTransport({
      host: "smtp.office365.com",
      port: 587,
      secure: false,
      auth: {
        user: "waleed.khaled@lombardia.com.jo",
        pass: "W712@o.com"
      }
    });

    await transporter.sendMail({
      from: '"Lombardia HR" <waleed.khaled@lombardia.com.jo>',
      to: "hr@lombardia.com.jo",
      subject: "طلب توظيف جديد - مع CV",
      html: `
        <p><b>الاسم:</b> ${req.body.fullName}</p>
        <p><b>الايميل:</b> ${req.body.email}</p>
        <p><b>الهاتف:</b> ${req.body.phone}</p>
        <p><b>الوظيفة:</b> ${req.body.position}</p>
        <p><b>ملاحظات:</b> ${req.body.notes || "لا يوجد"}</p>
        <p><b>📎 CV:</b> <a href="${fileLink}">اضغط هنا</a></p>
      `
    });

    res.send(`تم رفع الملف بنجاح! <a href="${fileLink}">فتح الملف</a>`);

  } catch (err) {
    console.error(err);
    res.status(500).send("❌ خطأ في رفع الملف أو إرسال الإيميل");
  } finally {
    fs.unlinkSync(filePath); // احذف الملف بعد الرفع
  }
});

app.listen(3000, () => console.log("🚀 Server running at http://localhost:3000"));
