require('dotenv').config();
require('module-alias/register');

const nodemailer = require("nodemailer");

const emailtransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: 587, // STARTTLS port
    secure: false, // important: false = STARTTLS (not SMTPS)
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
    },
    tls: {
        minVersion: 'TLSv1.2', // force modern TLS
        rejectUnauthorized: true, // fail on bad certs
    },
});


emailtransporter
    .sendMail({
        from: "noreply@ebg.pw",
        to: "test@ebg.pw",
        subject: "Hello from tests ✔",
        text: "This message was sent from a Node.js integration test.",
    })
    .then((info) => {
        console.log("Message sent: %s", info.messageId);
        // Preview the stored message in Ethereal’s web UI
        console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
    })
    .catch(console.error);