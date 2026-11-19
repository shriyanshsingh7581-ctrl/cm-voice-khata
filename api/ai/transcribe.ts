import { handleTranscribe, type NodeRequest, type NodeResponse } from '../_lib/openrouter';

export default async function handler(req: NodeRequest, res: NodeResponse) {
  return handleTranscribe(req, res);
}
