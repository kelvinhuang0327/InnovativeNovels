export type ConsumerDestination = 'catalog' | 'library'

interface ConsumerNavigationProps {
  readonly currentDestination: ConsumerDestination
  readonly onNavigate: (destination: ConsumerDestination) => void
}

const destinations = [
  { id: 'catalog', label: '書城' },
  { id: 'library', label: '我的書架' },
] as const

function DestinationIcon({ destination }: { destination: ConsumerDestination }) {
  if (destination === 'catalog') {
    return (
      <svg
        aria-hidden="true"
        className="consumer-navigation__icon"
        focusable="false"
        viewBox="0 0 24 24"
      >
        <path d="M4.75 5.25A2.25 2.25 0 0 1 7 3h4.25v16.5H7a2.25 2.25 0 0 0-2.25 2.25V5.25Z" />
        <path d="M19.25 5.25A2.25 2.25 0 0 0 17 3h-4.25v16.5H17a2.25 2.25 0 0 1 2.25 2.25V5.25Z" />
      </svg>
    )
  }

  return (
    <svg
      aria-hidden="true"
      className="consumer-navigation__icon"
      focusable="false"
      viewBox="0 0 24 24"
    >
      <path d="M4 5.75A1.75 1.75 0 0 1 5.75 4h4.5A1.75 1.75 0 0 1 12 5.75v13.5A1.75 1.75 0 0 0 10.25 17h-4.5A1.75 1.75 0 0 0 4 18.75v-13Z" />
      <path d="M20 5.75A1.75 1.75 0 0 0 18.25 4h-4.5A1.75 1.75 0 0 0 12 5.75v13.5A1.75 1.75 0 0 1 13.75 17h4.5A1.75 1.75 0 0 1 20 18.75v-13Z" />
    </svg>
  )
}

export function ConsumerNavigation({
  currentDestination,
  onNavigate,
}: ConsumerNavigationProps) {
  return (
    <nav aria-label="主要導覽" className="consumer-navigation">
      {destinations.map((destination) => (
        <button
          aria-current={
            currentDestination === destination.id ? 'page' : undefined
          }
          className="consumer-navigation__item"
          key={destination.id}
          onClick={() => onNavigate(destination.id)}
          type="button"
        >
          <DestinationIcon destination={destination.id} />
          <span>{destination.label}</span>
        </button>
      ))}
    </nav>
  )
}
