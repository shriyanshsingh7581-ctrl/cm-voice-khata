import { handleTts, type NodeRequest, type NodeResponse } from '../_lib/openrouter.js';

export default async function handler(req: NodeRequest, res: NodeResponse) {
  return handleTts(req, res);
}
