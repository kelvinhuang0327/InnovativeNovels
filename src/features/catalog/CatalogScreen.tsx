import type { ContentBook } from '../../application/catalog/contentRepository'

interface CatalogScreenProps {
  readonly books: readonly ContentBook[]
  readonly onOpenBook: (bookId: string) => void
}

export function CatalogScreen({ books, onOpenBook }: CatalogScreenProps) {
  return (
    <section aria-labelledby="catalog-heading">
      <h1 className="screen-heading" id="catalog-heading">
        探索故事
      </h1>
      <p className="screen-copy">從一段潮聲開始，走進今天的閱讀旅程。</p>

      {books.map(({ book, description }) => (
        <article className="book-card" key={book.id}>
          <p className="book-meta">{book.categoryLabel}</p>
          <h2>{book.title}</h2>
          <p className="book-description">{description}</p>
          <button type="button" onClick={() => onOpenBook(book.id)}>
            查看書籍
          </button>
        </article>
      ))}
    </section>
  )
}
