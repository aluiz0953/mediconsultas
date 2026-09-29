// Invisible trap field for bots. People never see or focus it (off-screen,
// aria-hidden, not tabbable); scripted form fillers type into it. Whatever is
// in it is sent as `website`, and the API bans any sender that filled it in.
export function HoneypotField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
      <label>
        Deixe em branco
        <input
          type="text"
          name="hp_ref"
          tabIndex={-1}
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    </div>
  )
}
