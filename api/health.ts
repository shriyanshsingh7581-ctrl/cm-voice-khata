import { handleHealth, type NodeRequest, type NodeResponse } from './_lib/openrouter';

export default async function handler(req: NodeRequest, res: NodeResponse) {
  return handleHealth(req, res);
}
