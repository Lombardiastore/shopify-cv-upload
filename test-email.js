import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: "smtp.office365.com",
  port: 587,
  secure: false, // نستخدم STARTTLS
  auth: {
    user: "Waleed.Khaled@lombardia.com.jo",
    pass: "W712@o.com"
  },
  tls: {
    rejectUnauthorized: false // ✅ تجاهل فحص الشهادة
  }
});

transporter.verify((error, success) => {
  if (error) {
    console.error("❌ Error:", error);
  } else {
    console.log("✅ Connection successful:", success);
  }
});
