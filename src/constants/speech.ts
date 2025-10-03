// Speech analysis constants

export const FILLER_WORDS = [
  // Short hesitation sounds
  "um",
  "uh",
  "erm",
  "er",
  "ah",
  "oh",
  "mm",
  "mhmm",
  "mhm",
  "uh-huh",
  "uhuh",
  "uh-uh",
  "huh",
  "eh",

  // Elongated/variant forms (common written variants)
  "umm",
  "ummm",
  "uhh",
  "uhhh",
  "ermm",
  "ahh",
  "ohh",
  "mmm",

  // Simple discourse markers / connectors
  "like",
  "so",
  "well",
  "anyway",
  "anyhow",
  "anywho",
  "alright",
  "okay",
  "ok",
  "right",
  "righto",
  "alrighty",

  // Casual conversational tags
  "you know",
  "y'know",
  "you know what I mean",
  "you see",
  "you get me",
  "if you know what I mean",
  "you know what I'm saying",

  // Hedges / softeners / qualifiers
  "kind of",
  "kinda",
  "sort of",
  "sorta",
  "ish",
  "maybe",
  "perhaps",
  "I guess",
  "I suppose",
  "I reckon",
  "I think",
  "I feel",
  "I feel like",
  "I mean",
  "I dunno",
  "dunno",
  "I suppose",
  "I believe",
  "I assume",

  // Intensifiers often used as filler
  "actually",
  "basically",
  "literally",
  "seriously",
  "honestly",
  "frankly",
  "really",
  "definitely",
  "truly",
  "genuinely",

  // Pausing / conversational continuers
  "right?",
  "okay?",
  "you know?",
  "see?",
  "you see?",
  "okay so",
  "so yeah",
  "so anyway",
  "so then",
  "and then",
  "and so",

  // Soft commitments / polite hedges
  "for what it's worth",
  "to be honest",
  "to be fair",
  "if I'm honest",
  "not gonna lie",
  "no cap",
  "let's be real",

  // Long filler phrases and discourse markers
  "at the end of the day",
  "in the end",
  "that being said",
  "having said that",
  "all that being said",
  "for the most part",
  "as I said",
  "like I said",
  "as I mentioned",
  "if that makes sense",
  "if that makes any sense",
  "if that helps",
  "you know what I mean?",

  // "And" style vague continuations
  "and stuff",
  "and things",
  "and all that",
  "and all that jazz",
  "and all that stuff",
  "and so forth",
  "and so on",
  "and whatnot",
  "or something",
  "or whatever",
  "or something like that",
  "or so",
  "or the like",

  // Small pragmatic words (often fillers)
  "look",
  "listen",
  "okay look",
  "well look",
  "now",
  "now listen",
  "right now",
  "anyways",

  // Backchannels and short acknowledgements
  "yeah",
  "yep",
  "yup",
  "mm-hmm",
  "uh-huh",
  "nope",
  "nah",
  "mmm",
  "ah-ha",
  "aha",
  "wow",
  "oh wow",

  // Casual contractions / speechy things often treated as filler in transcripts
  "gonna",
  "wanna",
  "gotta",
  "lemme",
  "lemme see",
  "lemme think",
  "kinda like",
  "sort of like",

  // Common filler-longers and pragmatic closers
  "so yeah no",
  "so yeah but",
  "so anyway yeah",
  "anyway yeah",
  "anyway so",
  "moving on",
  "back to",
  "to be clear",
  "to be honest with you",
  "to tell the truth",
  "believe me",
  "honestly though",

  // Regional / slangy filler tokens
  "innit",
  "yeah yeah",
  "yer",
  "ya know",
  "y'all",
  "mate" /* NOTE: "mate" can be a filler/contextual in some dialects */,

  // Misc short fillers that occur often
  "well then",
  "well yeah",
  "like I said before",
  "as I was saying",
  "that sort of thing",
  "that kind of thing",
  "if you will",
  "if you like",
  "so to speak",
  "I mean like",
  "I mean you know",

  // Add commonly observed variants with minor punctuation (for matching in raw transcripts)
  "um...",
  "uh...",
  "erm...",
  "ah...",
  "oh...",
  "mmm...",
  "mm-hmm",
  "uh-huh",
  "uh-uh",
  "hmm",
] as const;

export const PACE_THRESHOLDS = {
  VERY_FAST: 180,
  FAST: 150,
  SLOW: 100,
  VERY_SLOW: 120,
} as const;

export const PAUSE_THRESHOLD = 1.2; // seconds

// Pace timeline configuration
export const PACE_SEGMENT_INTERVAL = 30; // seconds - calculate pace for each 30s segment
export const CONTEXT_WORDS_COUNT = 5; // words before/after filler for context

export type PaceDescription =
  | "very fast"
  | "a bit fast"
  | "normal"
  | "a bit slow"
  | "slow";

// Filler word detection utilities
const FILLER_SET = new Set(FILLER_WORDS.map(w => w.toLowerCase()));

export function normalizeToken(token: string): string {
  return token
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, '')   // remove punctuation except apostrophes
    .replace(/(.)\1+/g, '$1')      // collapse repeated characters: "ummmm" -> "um"
    .replace(/\s+/g, ' ')
    .trim();
}

export function isFillerWord(token: string): boolean {
  const clean = normalizeToken(token);
  if (FILLER_SET.has(clean)) return true;

  // also split multi-word tokens and check subsets (e.g., "you know what i mean" -> "you know")
  const parts = clean.split(' ');
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j <= parts.length; j++) {
      const chunk = parts.slice(i, j).join(' ');
      if (FILLER_SET.has(chunk)) return true;
    }
  }

  return false;
}
