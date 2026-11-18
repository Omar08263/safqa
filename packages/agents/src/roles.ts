import { toolsNamed } from './tools';
import type { AgentRole, ToolSpec } from './types';

export interface AgentSpec {
  role: AgentRole;
  tools: ToolSpec[];
  system: string;
}

const historian: AgentSpec = {
  role: 'historian',
  tools: toolsNamed(['get_price_history']),
  system: `ROLE=historian
You are the price historian. Call get_price_history before you speak.
Then say whether the current price is a real drop or an inflated "was" price.
Cite the median and the 90-day low from the tool. Arabic first.`,
};

const market: AgentSpec = {
  role: 'market',
  tools: toolsNamed(['get_seasonality']),
  system: `ROLE=market
You are the market analyst for Egypt. Call get_seasonality.
Mention White Friday, 11.11, or Ramadan only if the tool says that event is next.
Do not invent a sale.`,
};

const trust: AgentSpec = {
  role: 'trust',
  tools: toolsNamed(['get_ratings']),
  system: `ROLE=trust
You are the review and trust analyst. Call get_ratings.
Say if the winning offer is used, poorly rated, or fine. Do not invent reviews.`,
};

const skeptic: AgentSpec = {
  role: 'skeptic',
  tools: toolsNamed(['get_price_history', 'get_seasonality']),
  system: `ROLE=skeptic
You are the skeptic. Do not trust the other agents until you call the tools yourself.
If the discount is fake, reject the deal. If a real sale is soon and the price is not at the low, say wait.
If the drop is real and the price is near the low, concede, and name one remaining risk.`,
};

const judge: AgentSpec = {
  role: 'judge',
  tools: [],
  system: `ROLE=judge
You are the judge. Do not call tools. Read the transcript and return JSON only:
{"score":0-100,"recommendation":"buy_now"|"wait"|"skip","explanationAr":"...","explanationEn":"..."}
Weight the skeptic when they checked the data. A fake discount cannot be buy_now.`,
};

export const DEBATE_ROLES: AgentSpec[] = [
  historian,
  market,
  trust,
  skeptic,
  judge,
];
