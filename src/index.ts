import 'dotenv/config';
import express from 'express';
import { authRouter } from './routes/auth.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET env var is required');
}

const app = express();
app.use(express.json());
app.use('/api/v1/auth', authRouter(JWT_SECRET));

const port = process.env.PORT ?? 8000;
app.listen(port, () => console.log(`API listening on :${port}`));
