import express from "express";
import multer from "multer";
import fs from "fs";
import { google } from "googleapis";
import nodemailer from "nodemailer";

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ==================== GOOGLE DRIVE AUTH ====================
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const TOKEN = JSON.parse(process.env.TOKEN);

const oAuth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);
oAuth2Client.setCredentials(TOKEN);

const drive = google.drive({ version: "v3", auth: oAuth2Client });

// helper صغير لتأمين النص داخل HTML
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
  if (!req.file) {
    console.error("No file received");
    return res.status(400).send("❌ لم يتم إرفاق ملف CV");
  }

  // اقرأ كل بيانات المتقدم
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

  // 1) رفع الملف إلى Google Drive
  try {
    const up = await drive.files.create({
      requestBody: { name: req.file.originalname, mimeType: req.file.mimetype },
      media: { mimeType: req.file.mimetype, body: fs.createReadStream(filePath) },
    });

    const fileId = up.data.id;

    await drive.permissions.create({
      fileId,
      requestBody: { role: "reader", type: "anyone" },
    });

    fileLink = `https://drive.google.com/file/d/${fileId}/view`;
    console.log("Uploaded to Drive:", fileLink);
  } catch (e) {
    console.error("Drive upload error:", e?.response?.data || e);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return res.status(500).send("❌ خطأ في رفع الملف إلى Google Drive");
  } finally {
    // نظافة محلية
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  // 2) إرسال الإيميل (بجدول أنيق)
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.office365.com",
      port: 587,
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    const rows = ([
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
    ])
      .map(
        ([k, v]) =>
          `<tr>
             <td style="padding:10px 12px;border:1px solid #eee;background:#faf7f2;">${esc(
               k
             )}</td>
             <td style="padding:10px 12px;border:1px solid #eee;">${v}</td>
           </tr>`
      )
      .join("");

    const html = `
      <div style="font-family:Tahoma,Arial,sans-serif;font-size:15px;color:#222">
        <h2 style="margin:0 0 7px;color:#9E7A47;">طلب توظيف جديد</h2>
        <table style="border-collapse:collapse;min-width:540px">
          ${rows}
        </table>
      </div>
    `;

    await transporter.sendMail({
      // اسم المرسل = اسم المتقدّم، والإرسال من بريد الشركة
      from: `"${data.fullName}" <${process.env.SMTP_USER}>`,
      to: "waleed.khaled@lombardia.com.jo",
      cc: "hr@lombardia.com.jo",
      subject: `${data.position} - ${data.fullName} - طلب توظيف`,
      replyTo: data.email || undefined,
      html,
    });

    console.log("Email sent OK");
    return res.send(`✅ تم رفع الملف بنجاح! <a href="${fileLink}">فتح الملف</a>`);
  } catch (e) {
    console.error("Email error:", e);
    return res
      .status(200)
      .send(`✅ الملف مرفوع، لكن تعذّر إرسال الإيميل حالياً. هذا رابط الملف: <a href="${fileLink}">فتح الملف</a>`);
  }
});

// ==================== SERVER LISTEN ====================
app.listen(3000, () => console.log("🚀 Server running on port 3000"));
