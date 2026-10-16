/**
 * Pemisah titik tengah. Dipakai titik CSS (bukan glyph "·") agar jaraknya
 * simetris di semua font; pembaca layar mendengarnya sebagai koma.
 */
export function Sep() {
  return (
    <>
      <span aria-hidden="true" className="mx-1.5 inline-block size-[3px] rounded-full bg-current align-middle opacity-70" />
      <span className="sr-only">, </span>
    </>
  );
}
