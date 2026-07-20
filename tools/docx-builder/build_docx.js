const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  TableOfContents, PageBreak, ImageRun, LevelFormat, PositionalTab,
  PositionalTabAlignment, PositionalTabLeader
} = require("docx");

const BLUE = "3b6fd4", GREEN = "2e9e5b", ORANGE = "e08a1e", PURPLE = "7a4fc0", DARK = "1f2733", GREY = "5b6472";
const HEAD_SHADE = "eef2f8";

// ---------- helpers ----------
const P = (text, opts = {}) => new Paragraph({
  spacing: { after: opts.after ?? 120, before: opts.before ?? 0, line: 276 },
  alignment: opts.align,
  children: (Array.isArray(text) ? text : [new TextRun({ text, size: opts.size ?? 21, color: opts.color ?? DARK, bold: opts.bold, italics: opts.italics })]),
});

const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 320, after: 140 }, children: [new TextRun({ text: t, bold: true, size: 30, color: DARK })] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 100 }, children: [new TextRun({ text: t, bold: true, size: 25, color: BLUE })] });
const H3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 180, after: 80 }, children: [new TextRun({ text: t, bold: true, size: 22, color: DARK })] });

const bullet = (text, level = 0) => new Paragraph({
  numbering: { reference: "bullets", level },
  spacing: { after: 60, line: 268 },
  children: Array.isArray(text) ? text : [new TextRun({ text, size: 21, color: DARK })],
});
const t = (s, o = {}) => new TextRun({ text: s, size: 21, color: DARK, ...o });

// ---------- table builder ----------
function tbl(headers, rows, colW, headColor = BLUE) {
  const total = colW.reduce((a, b) => a + b, 0);
  const border = { style: BorderStyle.SINGLE, size: 4, color: "c9d2df" };
  const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };
  const headRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => new TableCell({
      width: { size: colW[i], type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: headColor },
      margins: { top: 60, bottom: 60, left: 90, right: 90 },
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: "ffffff", size: 19 })] })],
    })),
  });
  const bodyRows = rows.map((r, ri) => new TableRow({
    children: r.map((c, i) => new TableCell({
      width: { size: colW[i], type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: ri % 2 ? "f4f7fb" : "ffffff" },
      margins: { top: 50, bottom: 50, left: 90, right: 90 },
      children: [new Paragraph({ children: [new TextRun({ text: String(c), size: 18, color: DARK })] })],
    })),
  }));
  return new Table({ columnWidths: colW, width: { size: total, type: WidthType.DXA }, borders, rows: [headRow, ...bodyRows] });
}

// checkmark matrix cell
const CK = "✓", NO = "–";

const children = [];

// ===================== TITLE =====================
children.push(
  new Paragraph({ spacing: { before: 1800, after: 0 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Skladový a zásielkový systém", bold: true, size: 52, color: DARK })] }),
  new Paragraph({ spacing: { before: 120, after: 0 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Funkčná špecifikácia a návrh databázy", size: 30, color: BLUE })] }),
  new Paragraph({ spacing: { before: 600, after: 0 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Moduly: A) Sklad   ·   B) Sledovanie zásielok", size: 22, color: GREY })] }),
  new Paragraph({ spacing: { before: 60, after: 0 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Verzia 1.0  ·  návrh na diskusiu", size: 20, italics: true, color: GREY })] }),
  new Paragraph({ children: [new PageBreak()] }),
);

// ===================== TOC =====================
children.push(
  new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: "Obsah", bold: true, size: 30, color: DARK })] }),
  new TableOfContents("Obsah", { hyperlink: true, headingStyleRange: "1-2" }),
  new Paragraph({ children: [new PageBreak()] }),
);

// ===================== 1. ÚVOD =====================
children.push(H1("1. Úvod a cieľ systému"));
children.push(P("Cieľom projektu je vytvoriť jednotný interný systém, ktorý spája dva hlavné moduly – správu skladu (A) a sledovanie zásielok (B) – nad spoločnou databázou a spoločným modelom používateľov a oprávnení. Systém zároveň sprístupňuje vybrané dáta externým aplikáciám cez zabezpečené API."));
children.push(P("Tento dokument slúži ako funkčná špecifikácia (PRD) a návrh dátového modelu. Je určený pre interný tím, ktorý bude systém stavať postupne (aj s pomocou AND asistenta). Popisuje čo má systém robiť, ako sú definované role a dáta, a odporúča technológie – nie je to hotový zdrojový kód."));
children.push(H2("1.1 Kľúčové princípy návrhu"));
children.push(bullet([t("Jedna databáza, dva moduly. ", { bold: true }), t("Sklad a zásielky zdieľajú produkty, adresy, používateľov a logy, takže dáta netreba duplikovať.")]));
children.push(bullet([t("Role a oprávnenia oddelené od kódu. ", { bold: true }), t("Admin mení prístupy cez tabuľku v rozhraní, bez zásahu programátora.")]));
children.push(bullet([t("Mobil na prvom mieste pri skenovaní. ", { bold: true }), t("Príjem, presuny a odpis sériových čísel / QR fungujú pohodlne v mobile.")]));
children.push(bullet([t("Auditovateľnosť. ", { bold: true }), t("Každá zmena a aktivita používateľa je zaznamenaná.")]));
children.push(bullet([t("Pripravené na rozšírenie. ", { bold: true }), t("Faktúry, predaje a história cien majú v modeli vyhradené miesto už teraz.")]));

// ===================== 2. ROZSAH =====================
children.push(H1("2. Rozsah systému"));
children.push(H2("2.1 V rozsahu (verzia 1)"));
children.push(bullet("Modul Sklad: katalóg položiek, obrázky, ceny s históriou a zdrojom, umiestnenia a vizualizácia skladu, sériové čísla a QR kódy, presuny a transfery medzi skladmi, kusovníky (BOM) pre zložené produkty, filtre a reporty zásob."));
children.push(bullet("Modul Zásielky: evidencia zásielok podľa tracking number, automatické zisťovanie stavu cez API prepravcov, adresy z/do, náhrada zásielky, evidencia platby a faktúry, colné odbavenia."));
children.push(bullet("Prierezovo: role a oprávnenia (RBAC), správa externých API klientov, logy zmien a aktivity, vyhľadávanie podľa viacerých kritérií, generovanie zoznamov, prepojenie zásielka → sklad."));
children.push(H2("2.2 Mimo rozsahu verzie 1 (roadmapa)"));
children.push(P("Plnohodnotný fakturačný a predajný modul, pokročilé cenotvorby a reporting predajov. V dátovom modeli sú pripravené základné tabuľky (invoices, product_prices s históriou), aby budúce rozšírenie nevyžadovalo prestavbu."));

// ===================== 3. RBAC =====================
children.push(H1("3. Používateľské role a prístupový model (RBAC)"));
children.push(P("Prístup je riešený modelom Role-Based Access Control: používateľ dostane jednu alebo viac rolí, rola nesie sadu oprávnení (permissions), a k tomu sa pridáva rozsah – ktorý modul (sklad / zásielky / oboje) a ktoré sklady daný používateľ vidí. Vďaka tomu vie admin meniť prístupy zaškrtávaním v tabuľke, bez zásahu do kódu."));

children.push(H2("3.1 Základné role"));
children.push(tbl(
  ["Rola", "Popis", "Typický rozsah"],
  [
    ["Admin", "Prístup všade, môže vytvárať, meniť aj mazať; spravuje používateľov, role, oprávnenia a API klientov.", "Sklad + Zásielky"],
    ["User", "Môže pridávať a upravovať záznamy vo svojom module; skenuje, presúva, prijíma. Nemôže mazať ani meniť oprávnenia.", "Sklad a/alebo Zásielky"],
    ["Visitor", "Iba na pozeranie – žiadne zmeny. Vidí len to, čo mu povolia filtre a rozsah.", "Sklad a/alebo Zásielky"],
    ["External", "Vzdialený obmedzený prístup – iba dotazy na konkrétne položky cez API. Nevidí rozhranie ani citlivé údaje.", "Definované dotazy"],
  ],
  [1500, 5100, 2400], BLUE));
children.push(P([t("Poznámka: ", { bold: true, italics: true }), t("role sú v systéme dátové záznamy, nie napevno v kóde. Admin môže pridať ďalšie role (napr. „Skladník“, „Zásielkár“, „Colný referent“, „Partner-API“) a nastaviť im oprávnenia. Systémové role (admin/user/visitor/external) sú predvyplnené šablóny.", { italics: true, color: GREY })], { size: 19 }));

children.push(H2("3.2 Rozdelenie podľa modulov a skladov"));
children.push(P("Každé priradenie roly používateľovi má rozsah modulu (sklad / zásielky / oboje), takže sa jednoducho určí, kto pracuje so skladom, kto so zásielkami a kto s oboma. Navyše sa dá obmedziť viditeľnosť na konkrétne sklady cez tabuľku prístupu k skladom – napr. používateľ vidí len Sklad 1."));

children.push(H2("3.3 Externé role a API klienti"));
children.push(P("Keďže databáza má volať a posielať údaje aj externým aplikáciám, external prístup nie je bežný používateľ, ale API klient s vlastným kľúčom. Každý API klient má priradenú rolu (rozsah dotazov), povolené IP adresy, limit požiadaviek a možnosť kedykoľvek deaktivovať kľúč. Admin ich spravuje na prehľadnej podstránke a môže podľa potreby vytvárať ďalšie špecializované role (napr. „len ceny“, „len stavy zásielok“). Tým je splnená požiadavka, že v budúcnosti môže vzniknúť viac rolí."));

children.push(H2("3.4 Matica oprávnení (admin ju upravuje zaškrtávaním)"));
children.push(P("Toto je prehľadná tabuľka v admin rozhraní. Riadky sú konkrétne oprávnenia (zoskupené podľa modulu), stĺpce sú role, bunky sú prepínače. Nižšie sú predvolené hodnoty pre základné role; admin ich môže ľubovoľne meniť."));

const permHead = ["Oprávnenie (kód)", "Admin", "User", "Visitor", "External"];
const permW = [4200, 1200, 1200, 1200, 1200];
const permRows = [
  ["SKLAD", "", "", "", ""],
  ["product.view – zobraziť produkty", CK, CK, CK, NO],
  ["product.create / edit – pridať / upraviť", CK, CK, NO, NO],
  ["product.delete – zmazať", CK, NO, NO, NO],
  ["price.view_meta – kto/kedy zadal cenu (i)", CK, CK, CK, NO],
  ["price.edit – upraviť cenu", CK, CK, NO, NO],
  ["inventory.view – stav na skladoch", CK, CK, CK, NO],
  ["inventory.move / transfer – presun/transfer", CK, CK, NO, NO],
  ["inventory.writeoff – odpis", CK, NO, NO, NO],
  ["qr.scan – skenovať QR/SN", CK, CK, NO, NO],
  ["qr.assign / reprint – párovať/dotlač QR", CK, CK, NO, NO],
  ["premium.view – vidieť prémiové produkty", CK, NO, NO, NO],
  ["stock.report – prehľad zásob", CK, CK, CK, NO],
  ["ZÁSIELKY", "", "", "", ""],
  ["shipment.view – zobraziť zásielky", CK, CK, CK, NO],
  ["shipment.create / edit", CK, CK, NO, NO],
  ["shipment.tracking.refresh – aktualizovať stav", CK, CK, NO, NO],
  ["shipment.replace – nahradiť zásielku", CK, CK, NO, NO],
  ["shipment.payment – platba/faktúra", CK, CK, NO, NO],
  ["customs.manage – colné odbavenia", CK, CK, NO, NO],
  ["SYSTÉM", "", "", "", ""],
  ["user.manage – správa používateľov", CK, NO, NO, NO],
  ["role.manage / permission.assign", CK, NO, NO, NO],
  ["apiclient.manage – správa API klientov", CK, NO, NO, NO],
  ["audit.view – logy zmien", CK, NO, NO, NO],
  ["activity.view – aktivita používateľov", CK, NO, NO, NO],
  ["api.query – dotaz na konkrétne položky", CK, NO, NO, CK],
];
// build with section-highlight rows
(function permTable() {
  const border = { style: BorderStyle.SINGLE, size: 4, color: "c9d2df" };
  const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };
  const rows = [];
  rows.push(new TableRow({ tableHeader: true, children: permHead.map((h, i) => new TableCell({
    width: { size: permW[i], type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill: BLUE },
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    children: [new Paragraph({ alignment: i ? AlignmentType.CENTER : AlignmentType.LEFT, children: [new TextRun({ text: h, bold: true, color: "ffffff", size: 18 })] })],
  })) }));
  permRows.forEach((r) => {
    const isSection = r[1] === "" && r[2] === "";
    if (isSection) {
      rows.push(new TableRow({ children: [new TableCell({
        columnSpan: 5, width: { size: permW.reduce((a, b) => a + b, 0), type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill: "dbe6f6" }, margins: { top: 40, bottom: 40, left: 90, right: 90 },
        children: [new Paragraph({ children: [new TextRun({ text: r[0], bold: true, size: 18, color: BLUE })] })],
      })] }));
    } else {
      rows.push(new TableRow({ children: r.map((c, i) => new TableCell({
        width: { size: permW[i], type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill: "ffffff" },
        margins: { top: 40, bottom: 40, left: 90, right: 90 },
        children: [new Paragraph({ alignment: i ? AlignmentType.CENTER : AlignmentType.LEFT, children: [new TextRun({ text: String(c), size: 17, color: i && c === CK ? GREEN : (i && c === NO ? "b3b9c2" : DARK), bold: i && c === CK })] })],
      })) }));
    }
  });
  children.push(new Table({ columnWidths: permW, width: { size: permW.reduce((a, b) => a + b, 0), type: WidthType.DXA }, borders, rows }));
})();
children.push(P([t("✓ = povolené, – = zakázané. ", { color: GREY, italics: true }), t("Hodnoty sú predvolené; admin ich mení v tejto tabuľke pre každú rolu zvlášť.", { color: GREY, italics: true })], { size: 18 }));

children.push(H2("3.5 Správa rolí a oprávnení v admin rozhraní"));
children.push(bullet("Podstránka „Používatelia“ – zoznam, priradenie rolí, rozsah modulu, prístup k skladom, aktivácia/deaktivácia."));
children.push(bullet("Podstránka „Role a oprávnenia“ – matica z bodu 3.4; vytváranie nových rolí a klonovanie existujúcich."));
children.push(bullet("Podstránka „API klienti (external)“ – správa kľúčov, rozsahov dotazov, povolených IP a limitov; história volaní."));

// ===================== 4. ARCHITEKTÚRA =====================
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(H1("4. Architektúra a odporúčaný technologický stack"));
children.push(P("Keďže systém bude stavať interný tím a má byť webový aj mobilný (skenovanie), odporúčam jeden moderný, dobre podporovaný a AI-friendly stack. Cieľom je rýchly vývoj, jedna spoločná databáza a jednoduché API pre externé aplikácie."));
children.push(H2("4.1 Odporúčaný stack"));
children.push(tbl(
  ["Vrstva", "Odporúčanie", "Prečo"],
  [
    ["Databáza", "PostgreSQL", "Robustná, relačná, zvláda JSON polia (api_config, filtre), plnotextové vyhľadávanie, audit. Zadarmo."],
    ["Backend / API", "Node.js (NestJS) alebo Python (Django/FastAPI)", "Rýchly vývoj REST/JSON API, silná ekosystémová podpora, dobré pre integrácie s prepravcami."],
    ["Web frontend", "React (Next.js) + TypeScript", "Komponentové admin rozhranie, tabuľky, filtre; jeden jazyk s backendom pri Node."],
    ["Mobil / skenovanie", "PWA (webová appka v mobile) + kamera/QR", "Rýchle nasadenie bez app store; kamera číta QR aj čiarové kódy. Neskôr možná natívna appka."],
    ["Autentifikácia", "JWT + role/oprávnenia; API kľúče pre external", "Oddelené prihlásenie ľudí a strojový prístup externých aplikácií."],
    ["Úložisko obrázkov", "Objektové úložisko (S3-kompatibilné) alebo disk", "Obrázky produktov + odkazy na obrázky z internetu."],
    ["Nasadenie", "Docker; cloud VPS alebo interný server", "Prenositeľné, jednoduché zálohy a škálovanie."],
  ],
  [1900, 3400, 3700], GREEN));
children.push(P([t("Alternatíva pre veľmi rýchly štart: ", { bold: true }), t("nízkokódová platforma nad PostgreSQL (napr. Supabase pre API + auth, alebo interný admin nástroj). Vhodné na prototyp; pri raste sa oplatí vlastný backend kvôli logike párovania QR, integráciám prepravcov a colným odbaveniam.")]));
children.push(H2("4.2 Integrácie"));
children.push(bullet([t("Prepravcovia: ", { bold: true }), t("stav zásielok cez API. Buď priamo (DHL, UPS, DPD, GLS, Packeta/Zásielkovňa, Slovenská pošta), alebo cez agregátor sledovania (napr. AfterShip, EasyPost, Shippo, Sendcloud), ktorý zjednotí viacero prepravcov jedným rozhraním. Konkrétne API a ceny treba overiť pri implementácii.")]));
children.push(bullet([t("Externé aplikácie: ", { bold: true }), t("čítajú a zapisujú dáta cez naše REST API s API kľúčom a rozsahom (kap. 11).")]));
children.push(bullet([t("Ceny z internetu: ", { bold: true }), t("voliteľné automatické dopĺňanie orientačnej ceny s uložením zdroja a času aktualizácie.")]));

// ===================== 5. DÁTOVÝ MODEL =====================
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(H1("5. Dátový model a ER diagram"));
children.push(P("Nasledujúci ER diagram zobrazuje hlavné entity rozdelené do štyroch oblastí: prístup a role, sklad, sledovanie zásielok, logy a audit. Červené prepojenia znázorňujú väzbu medzi zásielkou a skladom (doručená zásielka vytvorí/aktivuje položku)."));

// image
const imgBuf = fs.readFileSync(__dirname + "/er_diagram.png");
// original 2747 x 4376 -> fit width ~560pt keeping ratio
const imgW = 470, imgH = Math.round(470 * (4376 / 2747));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 100, after: 80 },
  children: [new ImageRun({ type: "png", data: imgBuf, transformation: { width: imgW, height: imgH } })] }));
children.push(P([t("ER diagram je priložený aj ako samostatný obrázok (er_diagram.png) vo vyššom rozlíšení.", { italics: true, color: GREY })], { size: 18, align: AlignmentType.CENTER }));

children.push(H2("5.1 Prehľad hlavných tabuliek"));
children.push(tbl(
  ["Oblasť", "Tabuľky"],
  [
    ["Prístup / role", "users, roles, permissions, role_permissions, user_roles (s rozsahom modulu), user_warehouse_access, api_clients"],
    ["Sklad – katalóg", "products, categories, product_images, product_prices (história), product_components (BOM)"],
    ["Sklad – zásoby", "warehouses, locations (pozície), inventory_units (kus), serial_numbers, qr_codes, qr_batches, stock_levels, stock_movements, saved_filters"],
    ["Zásielky", "shipments, shipment_events, shipment_items, carriers, addresses, customs_declarations, invoices"],
    ["Logy", "audit_logs (zmeny), activity_logs (aktivita používateľov)"],
  ],
  [2400, 6600], GREEN));

children.push(H2("5.2 Kľúčové rozhodnutia v modeli"));
children.push(bullet([t("Produkt vs. kus. ", { bold: true }), t("products je katalógová položka (typ), inventory_units je konkrétny fyzický kus s QR kódom a stavom. Nesériové/hromadné položky sa evidujú množstevne cez stock_levels.")]));
children.push(bullet([t("Viac sériových čísel na kus. ", { bold: true }), t("serial_numbers má vzťah N:1 na inventory_units, takže jeden produkt/kus môže mať viac sériových čísel.")]));
children.push(bullet([t("Predpripravené QR. ", { bold: true }), t("qr_codes vznikajú vo várkach (qr_batches) so stavom „voľný“ a napária sa na kus pri skenovaní. Poškodený QR sa označí a vygeneruje/napári sa nový (pretlač).")]));
children.push(bullet([t("Cena so zdrojom a históriou. ", { bold: true }), t("product_prices ukladá každú zmenu ceny: hodnotu, kto ju zadal (alebo že je z internetu), zdrojový odkaz a čas – to je obsah ikony „i“ pri cene.")]));
children.push(bullet([t("Zložené produkty. ", { bold: true }), t("product_components (kusovník/BOM) spája nadradený produkt s komponentmi a množstvom – napr. počítač = doska + pamäte + disky + procesor + case.")]));
children.push(bullet([t("Umiestnenie a vizualizácia. ", { bold: true }), t("locations tvoria strom (sklad → zóna → regál → pozícia) a majú súradnice pos_x/pos_y pre jednoduchú vizualizáciu skladu.")]));
children.push(bullet([t("Prepojenie modulov. ", { bold: true }), t("inventory_units.shipment_id + status = „pending / na ceste“ + expected_delivery_date umožňuje, aby položka vznikla už počas prepravy a po doručení sa automaticky aktivovala v sklade.")]));

// ===================== 6. SKLAD =====================
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(H1("6. Modul Sklad (detailne)"));

children.push(H2("6.1 Položky a obrázky"));
children.push(bullet("Vytváranie položiek s SKU, názvom, popisom, kategóriou a príznakmi (virtuálna, zložená, prémiová)."));
children.push(bullet("Viacero obrázkov na položku; jeden hlavný. Obrázok sa nahrá, alebo (pri virtuálnych položkách) použije z internetu cez URL."));
children.push(bullet("Zložené produkty: kusovník (BOM) s komponentmi a množstvom; možnosť „rozobrať“ na komponenty alebo „zložiť“."));

children.push(H2("6.2 Cena a ikona „i“"));
children.push(bullet("Pri každom produkte orientačná cena. Ikona „i“ zobrazí: kto cenu zadal alebo že je automaticky z internetu, zdrojový odkaz a dátum poslednej aktualizácie."));
children.push(bullet("Celá história cien sa uchováva (pripravené na budúci modul faktúr a predajov)."));

children.push(H2("6.3 Umiestnenie a vizualizácia skladu"));
children.push(bullet("Každá položka má umiestnenie (sklad + pozícia). Pozície sú pomenované (napr. Regál A-03)."));
children.push(bullet("Samostatná stránka s jednoduchou vizualizáciou skladu s pomenovanými časťami; kliknutím na pozíciu sa zobrazí jej obsah."));

children.push(H2("6.4 Identifikácia: sériové číslo a QR"));
children.push(bullet("Jedinečné produkty sa identifikujú sériovým číslom (ak ho majú) a QR kódom, ktorý sa lepí na produkt."));
children.push(bullet("QR kódy sú predpripravené na samolepiacom papieri (várky). Pri príjme stačí naskenovať sériové číslo a QR – automaticky sa napária."));
children.push(bullet("Opravy a dotlač: poškodený QR sa označí, vygeneruje sa nový a napári na ten istý kus."));
children.push(bullet("Jeden kus môže mať viac sériových čísel."));

children.push(H2("6.5 Prehľad, filtre a presuny"));
children.push(bullet("Výpis „čo je na ktorom sklade“ – otvorením Skladu 1 sa zobrazí presný zoznam položiek."));
children.push(bullet("Filtrovanie podľa viacerých kritérií; uložené filtre, ktoré si definuje používateľ alebo mu ich nastaví admin (napr. skryť prémiové produkty alebo celkové počty)."));
children.push(bullet("Jednoduchý presun položky: zmena pozície v sklade aj odoslanie na iný sklad (transfer). Každý pohyb sa loguje do stock_movements."));

// ===================== 7. ZÁSIELKY =====================
children.push(H1("7. Modul Sledovanie zásielok (detailne)"));
children.push(bullet("Každá zásielka má jedinečný tracking number. Zamestnanec zadá tracking number (mobil/počítač) a systém stiahne maximum údajov cez API prepravcu; chýbajúce polia sa doplnia ručne."));
children.push(bullet("Stav zásielky zodpovedá realite – priebežne sa overuje cez API prepravcu a ukladá do histórie (shipment_events)."));
children.push(bullet("Adresa z / do sa berie zo systému (tabuľka addresses)."));
children.push(bullet("Náhrada zásielky: ak ju zákazník nepreberie a vráti, zásielku možno nahradiť inou (väzba replaced_by)."));
children.push(bullet("Platba a faktúra: eviduje sa, či je zásielka zaplatená a aká faktúra k nej bola vystavená."));
children.push(bullet("Colné odbavenia: možnosť pridať colné odbavenie k zásielke (číslo, typ import/export, hodnota, clo, DPH, dokument)."));

// ===================== 8. PREPOJENIE =====================
children.push(H1("8. Prepojenie skladu a zásielok"));
children.push(P("Moduly sú previazané tak, aby položka nevznikala dvakrát:"));
children.push(bullet("Počas prepravy môže v sklade vzniknúť položka so stavom „pending / na ceste“ a predpokladaným dátumom doručenia."));
children.push(bullet("Po doručení zásielky na sklad sa položka automaticky aktivuje (status „skladom“) a priradí na cieľové umiestnenie."));
children.push(bullet("Odoslanie položky na iný sklad môže zároveň vytvoriť zásielku; pohyb sa prepojí (stock_movements ↔ shipments)."));

// ===================== 9. PRIEREZOVÉ =====================
children.push(H1("9. Prierezové funkcie"));
children.push(H2("9.1 Logy a audit"));
children.push(bullet("audit_logs: každá zmena záznamu (kto, čo, stará a nová hodnota, čas, IP) – vrátane zmien od API klientov."));
children.push(bullet("activity_logs: aktivita používateľov (prihlásenia, akcie, dotazy)."));
children.push(H2("9.2 Vyhľadávanie a zoznamy"));
children.push(bullet("Vyhľadávanie podľa viacerých kritérií naprieč produktmi, kusmi, zásielkami (SN, QR, tracking number, adresa, stav…)."));
children.push(bullet("Generovanie zoznamov a exportov (CSV/XLSX/PDF) – napr. inventúrne zoznamy, zoznamy zásielok."));
children.push(H2("9.3 Reporty"));
children.push(bullet("Prehľad zásob (podľa skladu, kategórie, stavu)."));
children.push(bullet("Aktivita používateľov a prehľad pohybov."));
children.push(H2("9.4 API pre externé aplikácie"));
children.push(bullet("Zabezpečené REST API; external role/klienti majú prístup len k povoleným dotazom a položkám (kap. 3.3 a 11)."));

// ===================== 10. MOBIL =====================
children.push(H1("10. Mobilné skenovanie a QR workflow"));
children.push(H3("Príjem novej položky"));
children.push(bullet("Naskenuj sériové číslo → naskenuj predpripravený QR → systém ich napári a vytvorí kus na zvolenom sklade/pozícii."));
children.push(H3("Presun / transfer"));
children.push(bullet("Naskenuj QR položky → zvoľ novú pozíciu alebo cieľový sklad → potvrď. Pohyb sa zaloguje."));
children.push(H3("Dotlač / oprava QR"));
children.push(bullet("Naskenuj starý (aj poškodený) QR alebo nájdi kus → vygeneruj nový QR → napári a označ starý ako poškodený."));
children.push(P([t("Technicky: ", { italics: true, color: GREY }), t("webová PWA s prístupom ku kamere číta QR aj čiarové kódy priamo v prehliadači mobilu; netreba inštaláciu z app store. Natívna appka je možná neskôr.", { italics: true, color: GREY })], { size: 19 }));

// ===================== 11. API =====================
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(H1("11. Návrh API (ukážka kľúčových endpointov)"));
children.push(P("REST/JSON API pre interný frontend aj externé aplikácie. Prístup riadia oprávnenia; external klienti sú obmedzení na povolené dotazy a rozsah dát."));
children.push(tbl(
  ["Metóda + endpoint", "Účel", "Prístup"],
  [
    ["GET /products?filter=…", "Zoznam/vyhľadanie produktov", "view"],
    ["POST /products", "Nový produkt", "product.create"],
    ["GET /products/{id}/prices", "História cien + zdroj (ikona i)", "price.view_meta"],
    ["GET /inventory?warehouse=1", "Čo je na sklade 1", "inventory.view"],
    ["POST /inventory/scan", "Napárovanie SN + QR pri príjme", "qr.scan"],
    ["POST /inventory/{id}/move", "Presun/transfer položky", "inventory.move"],
    ["POST /qr/reprint", "Dotlač/oprava QR", "qr.reprint"],
    ["POST /shipments", "Založ zásielku podľa tracking number", "shipment.create"],
    ["POST /shipments/{id}/refresh", "Aktualizuj stav cez API prepravcu", "shipment.refresh"],
    ["POST /shipments/{id}/customs", "Pridaj colné odbavenie", "customs.manage"],
    ["GET /external/items/{qr|sn}", "Obmedzený dotaz pre external klienta", "api.query"],
    ["GET /reports/stock", "Prehľad zásob", "stock.report"],
  ],
  [3300, 4000, 1700], BLUE));

// ===================== 12. BEZPEČNOSŤ =====================
children.push(H1("12. Bezpečnosť a súkromie"));
children.push(bullet("Autentifikácia používateľov (JWT), API kľúče pre external klientov s možnosťou revokácie."));
children.push(bullet("Kontrola oprávnení na úrovni API pri každej požiadavke; rozsah na modul a sklad."));
children.push(bullet("Obmedzenie external prístupu na IP a limit požiadaviek; logovanie všetkých volaní."));
children.push(bullet("Šifrovanie citlivých údajov (heslá hashované, API kľúče uložené ako hash), zálohovanie databázy."));

// ===================== 13. ROADMAPA =====================
children.push(H1("13. Roadmapa / fázovanie"));
children.push(tbl(
  ["Fáza", "Obsah"],
  [
    ["Fáza 1 – Základ skladu", "Používatelia + role/oprávnenia, produkty, obrázky, ceny, sklady, pozície, inventory_units, SN + QR, príjem a presuny (mobil)."],
    ["Fáza 2 – Zásielky", "Zásielky + tracking cez API prepravcov, adresy, náhrada, platba/faktúra, colné odbavenia."],
    ["Fáza 3 – Prepojenie a reporty", "Prepojenie zásielka→sklad (pending položky), vyhľadávanie, zoznamy, prehľady zásob, aktivita."],
    ["Fáza 4 – Externé API a role", "API pre externé aplikácie, správa API klientov, ďalšie špecializované role."],
    ["Fáza 5 – Faktúry a predaje", "Plný fakturačný/predajný modul, história cien v predaji, rozšírené reporty."],
  ],
  [2600, 6400], PURPLE));

// ===================== 14. OTVORENÉ OTÁZKY =====================
children.push(H1("14. Otvorené otázky na doriešenie"));
children.push(bullet("Ktorých prepravcov integrovať ako prvých a či ísť priamo alebo cez agregátora sledovania?"));
children.push(bullet("Aký formát a veľkosť QR kódov na samolepiacom papieri (rozmery, počet na hárok)?"));
children.push(bullet("Počet skladov a približný počet položiek/kusov (kvôli výkonu a vizualizácii)?"));
children.push(bullet("Ako presne definovať „prémiové“ produkty a ktoré filtre majú byť skryté pre ktoré role?"));
children.push(bullet("Napojenie na existujúce systémy (účtovníctvo, e-shop) a formát dát pre externé aplikácie?"));
children.push(bullet("Jazyky rozhrania (SK/EN) a viacero mien pri cenách?"));

children.push(new Paragraph({ spacing: { before: 300 }, children: [new TextRun({ text: "— Koniec dokumentu (verzia 1.0, návrh na diskusiu) —", italics: true, color: GREY, size: 18 })] }));

// ===================== DOC =====================
const doc = new Document({
  creator: "Cowork",
  title: "Skladový a zásielkový systém – špecifikácia",
  numbering: {
    config: [{
      reference: "bullets",
      levels: [
        { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { run: { color: BLUE }, paragraph: { indent: { left: 460, hanging: 240 } } } },
        { level: 1, format: LevelFormat.BULLET, text: "–", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 900, hanging: 240 } } } },
      ],
    }],
  },
  styles: {
    default: { document: { run: { font: "Calibri", size: 21, color: DARK } } },
  },
  sections: [{
    properties: { page: { margin: { top: 1100, bottom: 1100, left: 1200, right: 1200 } } },
    children,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(__dirname + "/Skladovy_a_zasielkovy_system_specifikacia.docx", buf);
  console.log("OK", buf.length);
});
