export function readPlateauSettings(search: string) {
  const params = new URLSearchParams(search)
  const raw = params.get('stretchStart')
  const value = raw?.trim() ? Number(raw) : 2000
  return {
    stretched: params.get('stretch') === '1',
    stretchStart: Number.isFinite(value)
      ? Math.round(Math.max(0, Math.min(2700, value)) / 100) * 100
      : 2000,
  }
}

export function writePlateauSettings(search: string, stretched: boolean, stretchStart: number) {
  const params = new URLSearchParams(search)
  params.set('stretch', stretched ? '1' : '0')
  params.set('stretchStart', String(stretchStart))
  return params.toString()
}
