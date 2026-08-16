import 'dotenv/config';
import { runPipeline } from '../agents/pipeline';

runPipeline()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
