import type { GenerationProvider } from '../../application/authoring/generationProvider'
import type {
  GeneratedDraft,
  GenerationRequest,
} from '../../domain/authoring/authoringContracts'

export const DETERMINISTIC_DRAFT_PROVIDER_NAME = 'deterministic-local-demo'

const CHAPTER_TITLES = ['火種', '回聲', '追問', '代價', '潮汐', '新頁']

export class DeterministicDraftProvider implements GenerationProvider {
  readonly name = DETERMINISTIC_DRAFT_PROVIDER_NAME

  async generateDraft(request: GenerationRequest): Promise<GeneratedDraft> {
    const chapters = Array.from(
      { length: request.requestedChapterCount },
      (_, index) => {
        const sequence = index + 1
        const title = `第${sequence}章：${CHAPTER_TITLES[index] ?? `轉折 ${sequence}`}`
        const paragraphs = [
          `第${sequence}章從${request.premise}開始，在${request.genre}的世界裡，第一個異常悄悄出現。`,
          `主角在第${sequence}章沒有立刻找到答案，只能沿著${request.premise}留下的線索前進。`,
          `第${sequence}章的每一次選擇都讓故事更靠近真相，也讓原本熟悉的生活失去平衡。`,
          `新的線索把人物帶往第${sequence}章的下一個場景，先前的承諾也因此必須重新衡量。`,
          `當第${sequence}章的夜色落下，真正的問題仍沒有消失，只等著下一章揭開。`,
        ]

        if (sequence === request.requestedChapterCount && sequence > 2) {
          paragraphs.pop()
        }

        return { sequence, title, prose: paragraphs }
      },
    )

    return {
      title: request.titleHint ?? `${request.genre}故事預覽`,
      categoryLabel: request.genre,
      chapters,
    }
  }
}
