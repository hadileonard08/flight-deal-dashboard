import 'dotenv/config';
import { runPipeline } from '../agents/pipeline';

runPipeline().catch(console.error);
