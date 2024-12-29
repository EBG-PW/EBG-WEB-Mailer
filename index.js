require('dotenv').config();
require('module-alias/register');

const { log } = require('@lib/logger');
const path = require('path');
const fs = require('fs');
const amqp = require('amqplib');
const nodemailer = require("nodemailer");
const i18next = require('i18next');
const { GetUserData } = require('@lib/postgres');
const { addConfirmationToken, addResetPasswordToken } = require('@lib/redis');

process.log = {};
process.log = log;

const emailTemplateFolder = path.join(__dirname, 'templates');
const mailTemplateStore = {};

fs.readdirSync(emailTemplateFolder).forEach((file) => {
  if (path.extname(file) === '.js') {
    const filename = path.basename(file, '.js');
    mailTemplateStore[filename] = require(path.join(emailTemplateFolder, file));
  }
});

const translationStore = {
  de: require(path.join(emailTemplateFolder, 'lang', 'de.json')),
  en: require(path.join(emailTemplateFolder, 'lang', 'en.json')),
};

const emailtransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const QUEUE_NAME = 'q_mail';

let connection;
let channel;

const initRabbitMQ = async () => {
  if (!connection) {
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();
    await channel.assertQueue(QUEUE_NAME, { durable: true });
  }
};

const processEmailJob = async (job) => {
  try {
    const userData = await GetUserData(job.receiverId);
    let emailText;

    process.log.debug(`Sending email to ${userData.email} with type: ${job.type}`);

    const lang = userData.language || process.env.FALLBACKLANG;
    const t = i18next.getFixedT(lang);

    switch (job.type) {
      case 'user:email_verification':
        emailText = mailTemplateStore.email_verification_text.generate(t, {
          username: userData.username,
          regUrl: `${job.data.appDomain}/api/v1/register/${job.data.urlPath}`,
        });

        await emailtransporter.sendMail({
          from: `${process.env.COMPANYNAME} - Webpanel <${process.env.SMTP_USER}>`,
          to: userData.email,
          subject: t('emails.registerMail.subject', { companyName: process.env.COMPANYNAME }),
          text: emailText,
        });

        await addConfirmationToken(job.data.urlPath, job.receiverId);
        break;

      case 'user:login':
        // Add login email handling if needed
        break;

      case 'user:reset_password':
        emailText = mailTemplateStore.email_passwordReset_text.generate(t, {
          username: userData.username,
          regUrl: `${job.data.appDomain}/api/v1/resetpassword/${job.data.urlPath}`,
        });

        await emailtransporter.sendMail({
          from: `${process.env.COMPANYNAME} - Webpanel <${process.env.SMTP_USER}>`,
          to: userData.email,
          subject: t('emails.passwordReset.subject', { companyName: process.env.COMPANYNAME }),
          text: emailText,
        });

        await addResetPasswordToken(job.data.urlPath, job.receiverId);
        break;

      default:
        throw new Error(`Invalid email type: ${job.type}`);
    }

  } catch (error) {
    process.log.error(error);
    process.log.error(JSON.stringify(job));
    throw error;
  }
};

const startWorker = async () => {
  await initRabbitMQ();
  await i18next.init({
    lng: 'de',
    fallbackLng: 'de',
    resources: translationStore,
  });

  channel.consume(QUEUE_NAME, async (message) => {
    if (message !== null) {
      const job = JSON.parse(message.content.toString());
      process.log.debug(`Processing job: ${JSON.stringify(job)}`);

      try {
        await processEmailJob(job);
        channel.ack(message);
      } catch (error) {
        channel.nack(message, false, false);
      }
    }
  });
};

startWorker().catch((err) => {
  console.error(err);
  process.log.error('Worker initialization failed:', err);
  process.exit(1);
});
