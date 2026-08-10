import {
  buildGenerationRequest,
  type AuthoringSpec,
} from '../../domain/authoring/authoringContracts'
import { createEmptyStoryBible, type StoryBibleV1 } from '../../domain/authoring/storyBible'
import { buildStoryBiblePromptSection } from './storyBiblePrompt'

const EXCHANGE_CONTRACT = `{
  "title": "小說名稱",
  "genre": "類型",
  "chapters": [
    {
      "sequence": 1,
      "title": "章節名稱",
      "prose": "完整小說正文"
    }
  ]
}`

export function buildAgentPrompt(
  spec: AuthoringSpec,
  storyBible: StoryBibleV1 = createEmptyStoryBible(),
): string {
  const request = buildGenerationRequest(spec)

  return [
    'Role: Novel Generation Agent',
    '',
    'Create a novel draft from the Authoring Spec below.',
    'Follow the writing requirements exactly and keep every chapter meaningful.',
    '',
    'Authoring Spec:',
    JSON.stringify(request, null, 2),
    '',
    ...buildStoryBiblePromptSection(storyBible),
    '',
    'Required JSON output contract:',
    EXCHANGE_CONTRACT,
    '',
    'Rules:',
    '- Return one JSON object only.',
    '- Output raw JSON only: no Markdown code fence, no preface, no explanation, and no text after the object.',
    '- Use only the fields title, genre, and chapters at the root; use only sequence, title, and prose in each chapter.',
    '- title, genre, chapter title, and prose must be non-empty strings where applicable.',
    '- Chapter sequence values must be positive, unique, continuous integers beginning at 1.',
    '- Do not include production book IDs, publication state, entitlement, or access-control fields.',
    '',
    'Final self-check before responding:',
    '- Confirm the JSON parses as an object.',
    '- Confirm chapters are present and every sequence from 1 through the final chapter is present exactly once.',
    '- Confirm the response contains JSON only.',
  ].join('\n')
}
