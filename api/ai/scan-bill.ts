import { handleScanBill, type NodeRequest, type NodeResponse } from '../_lib/openrouter.js';

export default async function handler(req: NodeRequest, res: NodeResponse) {
  return handleScanBill(req, res);
}
