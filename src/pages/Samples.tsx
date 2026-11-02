// Heading treatments to choose from. Once one is picked, this page goes away.

const OPTIONS = [
  {
    key: 'A',
    name: 'Plain',
    note: 'Night Machine page titles, serif section titles, nothing else. The calmest option.',
    title: <h1 className="sample__h1">Stock</h1>,
    section: <h2 className="sample__h2">Close sizes</h2>,
  },
  {
    key: 'B',
    name: 'One Night Machine word',
    note: 'Serif headings, with the one word that matters set in Night Machine.',
    title: (
      <h2 className="sample__h1 voice">
        Find the right <span className="display sample__word">tube</span>
      </h2>
    ),
    section: (
      <h2 className="sample__h2">
        Your <span className="display">reservations</span>
      </h2>
    ),
  },
  {
    key: 'C',
    name: 'One serif word',
    note: 'Sans headings with one serif italic word. Quieter and more editorial, Night Machine only in the logo.',
    title: (
      <h2 className="sample__h1 sample__sans">
        Find the right <em className="voice">tube</em>
      </h2>
    ),
    section: (
      <h2 className="sample__h2 sample__sans">
        Close <em className="voice">sizes</em>
      </h2>
    ),
  },
]

export default function Samples() {
  return (
    <div className="page">
      <h1 className="page__title">Heading samples</h1>
      <p className="soft">Pick one. It will be used everywhere.</p>
      <div className="samples">
        {OPTIONS.map((o) => (
          <section key={o.key} className="sample">
            <span className="tag">
              {o.key} · {o.name}
            </span>
            {o.title}
            {o.section}
            <p className="soft small">{o.note}</p>
          </section>
        ))}
      </div>
    </div>
  )
}
