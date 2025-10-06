export const envConfig = {
  database: {
    url: process.env.DATABASE_URL || 'mysql://root:password@localhost:3306/chatbot_db',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-here',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },
  whatsapp: {
    apiUrl: process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v18.0',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || 'your-whatsapp-access-token',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || 'your-phone-number-id',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || 'your-verify-token',
  },
  app: {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
};
