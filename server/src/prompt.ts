import { anchorOf, type ChainRequest, type Rejection, type TopicId } from '../../app/shared/src/index';

const TOPIC_TEXT: Record<TopicId, { vi: string; en: string }> = {
  random: { vi: 'ngẫu nhiên (bất kỳ chủ đề vui nào)', en: 'random (any fun topic)' },
  animals: { vi: 'động vật', en: 'animals' },
  food: { vi: 'đồ ăn, ẩm thực', en: 'food' },
  travel: { vi: 'du lịch', en: 'travel' },
  love: { vi: 'tình yêu, tình cảm trong sáng', en: 'love and friendship (wholesome)' },
  work: { vi: 'công việc, văn phòng', en: 'work and office life' },
  life: { vi: 'cuộc sống hằng ngày', en: 'everyday life' },
  funny: { vi: 'hài hước, tình huống bất ngờ', en: 'funny, surprising situations' },
  science: { vi: 'khoa học, vũ trụ', en: 'science and space' },
  free: { vi: 'không giới hạn chủ đề', en: 'no topic restriction' },
};

const REJECTION_TEXT: Record<Rejection, string> = {
  empty: 'the sentence was empty',
  too_short: 'the sentence was too short (need 5–15 words)',
  too_long: 'the sentence was too long (need 5–15 words)',
  wrong_language: 'the sentence was not entirely in the required language',
  no_link: 'the sentence did not start with the anchor word',
  repeat: 'the sentence repeated an earlier one',
  unsafe: 'the sentence contained inappropriate words',
  no_next_word: 'the sentence did not end with a usable word',
};

export function buildSystemPrompt(lang: 'vi' | 'en'): string {
  const languageName = lang === 'vi' ? 'Vietnamese (tiếng Việt)' : 'English';
  const langRules =
    lang === 'vi'
      ? `Vietnamese specifics:
- The anchor is a Vietnamese syllable ("tiếng"). Start the sentence with that syllable, alone or as the FIRST syllable of a natural compound word. Examples: anchor "giới" → "Giới trẻ ngày nay…"; anchor "sinh" (from "học sinh") → "Sinh viên…"; anchor "sáng" → "Sáng nay…".
- Use full, correct diacritics (Unicode NFC). Never answer in English or mix English words in.
- End with a real content word, never a particle like "nhé", "à", "rồi", "nhỉ", "lắm".`
      : `English specifics:
- Start with the anchor word or a natural inflection/derivation of it (bird → "Birds…", dance → "Dancing…", moon → "Moonlight…").
- Never answer in Vietnamese or any other language.
- End with a real content word (noun, verb or adjective), never "the", "it", "too", "again", etc.`;

  return `You are the sentence engine of WordFlow, a cheerful, pressure-free word-chain game for all ages.
The player gives a word; you reply with ONE new sentence that continues the chain.

Rules:
1. Write exactly one sentence, entirely in ${languageName}.
2. The sentence MUST begin with the anchor word (see the language specifics) — the anchor must appear within the first three words.
3. 5–15 words. Natural, meaningful and easy to understand. Prefer playful, warm, sometimes surprising or funny ideas. Never nonsense made only to connect words.
4. Family-friendly: no insults, politics, religion, violence, sexual content, or anything that could hurt someone.
5. End the sentence with a meaningful word that is fun to continue from — that last word becomes the player's next word.
6. Never repeat or closely paraphrase a sentence from the history.
7. Respect the requested topic when there is one.
8. If an anchor is hard, take a different creative association instead of giving up.

${langRules}

Reply with JSON only, no markdown:
{"sentence": "...", "keyword": "<anchor you used>", "next_word": "<last word of the sentence>", "hint_words": ["<next_word>", "<alternative word>", "<alternative word>"]}
hint_words are 3 short words in the same language the player could type next.`;
}

export function buildUserPrompt(req: ChainRequest, previousRejection?: Rejection): string {
  const anchor = anchorOf(req);
  const lang = req.language;
  const lines: string[] = [];
  lines.push(`Topic: ${TOPIC_TEXT[req.topic][lang]}`);

  switch (req.action) {
    case 'start':
      lines.push('Task: create a fun OPENING sentence for a new game (no anchor needed).');
      break;
    case 'skip':
      lines.push('Task: the player skipped the last sentence — write a COMPLETELY DIFFERENT sentence from the same anchor.');
      break;
    case 'topic':
      lines.push('Task: the player changed the topic — continue from the anchor but steer the sentence into the new topic.');
      break;
    default:
      lines.push('Task: continue the chain from the anchor.');
  }

  if (anchor) {
    lines.push(`Player input: "${req.keyword}"`);
    lines.push(`Anchor word: "${anchor.word}"${anchor.compound ? ` (it comes from the word "${anchor.compound}")` : ''}`);
  }
  if (req.history.length) {
    lines.push('Sentences already used (do not repeat):');
    req.history.slice(-10).forEach((h) => lines.push(`- ${h}`));
  }
  if (previousRejection) {
    lines.push(`Your previous answer was rejected because ${REJECTION_TEXT[previousRejection]}. Try a different association.`);
  }
  return lines.join('\n');
}
