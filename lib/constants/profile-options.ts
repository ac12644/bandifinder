/**
 * Predefined options for company profile fields.
 * Used in settings profile form for autocomplete and multi-select.
 */

// ---------------------------------------------------------------------------
// CPV Codes — Top-level divisions with Italian labels
// Users type to search, pick from suggestions
// ---------------------------------------------------------------------------

export interface CpvOption {
  code: string;
  label: string;
}

export const CPV_CODES: CpvOption[] = [
  // Agricoltura & Alimenti
  { code: "03000000", label: "03 - Prodotti agricoli, dell'allevamento e della pesca" },
  { code: "15000000", label: "15 - Prodotti alimentari, bevande, tabacco" },
  // Minerali & Combustibili
  { code: "09000000", label: "09 - Prodotti petroliferi, combustibili, energia" },
  { code: "14000000", label: "14 - Prodotti delle miniere, metalli" },
  // Costruzioni
  { code: "44000000", label: "44 - Strutture e materiali da costruzione" },
  { code: "45000000", label: "45 - Lavori di costruzione" },
  { code: "45100000", label: "45.1 - Preparazione del cantiere" },
  { code: "45200000", label: "45.2 - Lavori di costruzione completa o parziale" },
  { code: "45300000", label: "45.3 - Installazione impianti in edifici" },
  { code: "45400000", label: "45.4 - Lavori di completamento edifici" },
  // Macchinari & Attrezzature
  { code: "42000000", label: "42 - Macchinari industriali" },
  { code: "43000000", label: "43 - Macchinari per miniere e cave" },
  // Trasporti
  { code: "34000000", label: "34 - Attrezzature di trasporto" },
  { code: "60000000", label: "60 - Servizi di trasporto" },
  { code: "63000000", label: "63 - Servizi di trasporto complementari e ausiliari" },
  // IT & Telecomunicazioni
  { code: "30000000", label: "30 - Macchine per ufficio e computer" },
  { code: "32000000", label: "32 - Apparecchiature per telecomunicazioni" },
  { code: "48000000", label: "48 - Pacchetti software e sistemi informatici" },
  { code: "72000000", label: "72 - Servizi informatici e affini" },
  { code: "72200000", label: "72.2 - Programmazione software e consulenza" },
  { code: "72300000", label: "72.3 - Servizi di gestione dati" },
  { code: "72400000", label: "72.4 - Servizi Internet" },
  // Servizi professionali
  { code: "71000000", label: "71 - Servizi architettonici, di ingegneria e pianificazione" },
  { code: "71300000", label: "71.3 - Servizi di ingegneria" },
  { code: "71500000", label: "71.5 - Servizi di analisi e collaudo" },
  { code: "73000000", label: "73 - Servizi di ricerca e sviluppo" },
  { code: "79000000", label: "79 - Servizi per le imprese: legali, marketing, consulenza" },
  { code: "79200000", label: "79.2 - Servizi di contabilità e revisione" },
  { code: "79400000", label: "79.4 - Consulenza gestionale e servizi affini" },
  { code: "79500000", label: "79.5 - Servizi di supporto ufficio" },
  { code: "79600000", label: "79.6 - Servizi di reclutamento" },
  { code: "79800000", label: "79.8 - Servizi di stampa e affini" },
  // Sanità & Sociale
  { code: "33000000", label: "33 - Apparecchiature mediche e farmaceutiche" },
  { code: "85000000", label: "85 - Servizi sanitari e di assistenza sociale" },
  // Ambiente & Rifiuti
  { code: "90000000", label: "90 - Servizi fognari, rifiuti, pulizia, ambiente" },
  { code: "90500000", label: "90.5 - Smaltimento e trattamento rifiuti" },
  { code: "90700000", label: "90.7 - Servizi ambientali" },
  // Formazione & Cultura
  { code: "80000000", label: "80 - Servizi di istruzione e formazione" },
  { code: "92000000", label: "92 - Servizi ricreativi, culturali, sportivi" },
  // Utilities
  { code: "65000000", label: "65 - Servizi pubblici (acqua, energia)" },
  // Sicurezza & Difesa
  { code: "35000000", label: "35 - Attrezzature di sicurezza e difesa" },
  { code: "75000000", label: "75 - Servizi di pubblica amministrazione e difesa" },
  // Riparazione & Manutenzione
  { code: "50000000", label: "50 - Servizi di riparazione e manutenzione" },
  // Servizi finanziari & assicurativi
  { code: "66000000", label: "66 - Servizi finanziari e assicurativi" },
  // Servizi postali
  { code: "64000000", label: "64 - Servizi postali e di telecomunicazione" },
  // Tessile & Abbigliamento
  { code: "18000000", label: "18 - Indumenti, calzature, valigeria" },
  { code: "19000000", label: "19 - Cuoio, tessuti, plastica, gomma" },
  // Arredamento
  { code: "39000000", label: "39 - Arredamento, decorazioni, elettrodomestici" },
  // Chimici
  { code: "24000000", label: "24 - Prodotti chimici" },
  // Carta & Stampa
  { code: "22000000", label: "22 - Materiale stampato e prodotti affini" },
];

// ---------------------------------------------------------------------------
// Predefined Services (Italian)
// ---------------------------------------------------------------------------

export const PREDEFINED_SERVICES: string[] = [
  // IT & Digitale
  "Sviluppo software",
  "Consulenza IT",
  "Cybersecurity",
  "Cloud computing",
  "Gestione infrastruttura IT",
  "Sviluppo web e mobile",
  "Data analytics e business intelligence",
  "Intelligenza artificiale e machine learning",
  "System integration",
  "Manutenzione software",
  // Ingegneria & Costruzioni
  "Progettazione architettonica",
  "Ingegneria civile",
  "Ingegneria meccanica",
  "Ingegneria elettrica",
  "Direzione lavori",
  "Project management",
  "Collaudo e testing",
  "Manutenzione impianti",
  "Ristrutturazione edifici",
  "Efficientamento energetico",
  // Consulenza & Servizi professionali
  "Consulenza gestionale",
  "Consulenza legale",
  "Revisione contabile",
  "Servizi fiscali e tributari",
  "Formazione professionale",
  "Ricerca e sviluppo",
  "Marketing e comunicazione",
  "Risorse umane e selezione personale",
  // Ambiente & Energia
  "Gestione rifiuti",
  "Bonifica ambientale",
  "Monitoraggio ambientale",
  "Energie rinnovabili",
  "Valutazione impatto ambientale",
  // Sanità
  "Servizi sanitari",
  "Forniture medicali",
  "Servizi di laboratorio",
  // Logistica & Trasporti
  "Trasporto merci",
  "Logistica e magazzinaggio",
  "Facility management",
  // Sicurezza
  "Servizi di vigilanza",
  "Sicurezza sul lavoro",
  "Sicurezza informatica",
  // Pulizia & Manutenzione
  "Pulizia e sanificazione",
  "Manutenzione verde",
  "Global service",
];

// ---------------------------------------------------------------------------
// Predefined Certifications
// ---------------------------------------------------------------------------

export interface CertificationOption {
  value: string;
  label: string;
  description: string;
}

export const PREDEFINED_CERTIFICATIONS: CertificationOption[] = [
  // ISO
  { value: "ISO 9001", label: "ISO 9001", description: "Gestione qualità" },
  { value: "ISO 14001", label: "ISO 14001", description: "Gestione ambientale" },
  { value: "ISO 27001", label: "ISO 27001", description: "Sicurezza informazioni" },
  { value: "ISO 45001", label: "ISO 45001", description: "Salute e sicurezza sul lavoro" },
  { value: "ISO 22301", label: "ISO 22301", description: "Continuità operativa" },
  { value: "ISO 37001", label: "ISO 37001", description: "Anti-corruzione" },
  { value: "ISO 50001", label: "ISO 50001", description: "Gestione energia" },
  // SOA
  { value: "SOA", label: "SOA", description: "Attestazione lavori pubblici (Italia)" },
  { value: "SOA OG1", label: "SOA OG1", description: "Edifici civili e industriali" },
  { value: "SOA OG3", label: "SOA OG3", description: "Strade, autostrade, ponti" },
  { value: "SOA OG6", label: "SOA OG6", description: "Acquedotti e fognature" },
  { value: "SOA OG11", label: "SOA OG11", description: "Impianti tecnologici" },
  { value: "SOA OS6", label: "SOA OS6", description: "Finiture di opere generali" },
  // Altre certificazioni italiane
  { value: "EMAS", label: "EMAS", description: "Eco-Management and Audit Scheme" },
  { value: "SA 8000", label: "SA 8000", description: "Responsabilità sociale" },
  { value: "Rating di legalità", label: "Rating di legalità", description: "AGCM - Requisito etico" },
  { value: "Certificazione antimafia", label: "Certificazione antimafia", description: "Prefettura - White list" },
  { value: "DURC", label: "DURC", description: "Regolarità contributiva" },
  // ICT / Security
  { value: "CMMI", label: "CMMI", description: "Maturità processi software" },
  { value: "ITIL", label: "ITIL", description: "Gestione servizi IT" },
  { value: "PCI DSS", label: "PCI DSS", description: "Sicurezza dati pagamento" },
];

// ---------------------------------------------------------------------------
// Operating Regions
// ---------------------------------------------------------------------------

export interface RegionOption {
  code: string;
  label: string;
}

export const OPERATING_REGIONS: RegionOption[] = [
  // Italia
  { code: "ITA", label: "Italia" },
  // EU principali
  { code: "DEU", label: "Germania" },
  { code: "FRA", label: "Francia" },
  { code: "ESP", label: "Spagna" },
  { code: "NLD", label: "Paesi Bassi" },
  { code: "BEL", label: "Belgio" },
  { code: "AUT", label: "Austria" },
  { code: "PRT", label: "Portogallo" },
  { code: "GRC", label: "Grecia" },
  { code: "POL", label: "Polonia" },
  { code: "ROU", label: "Romania" },
  { code: "SWE", label: "Svezia" },
  { code: "CZE", label: "Repubblica Ceca" },
  { code: "HRV", label: "Croazia" },
  { code: "SVN", label: "Slovenia" },
  { code: "HUN", label: "Ungheria" },
  { code: "BGR", label: "Bulgaria" },
  { code: "DNK", label: "Danimarca" },
  { code: "FIN", label: "Finlandia" },
  { code: "IRL", label: "Irlanda" },
  { code: "LUX", label: "Lussemburgo" },
  { code: "MLT", label: "Malta" },
  { code: "SVK", label: "Slovacchia" },
  { code: "EST", label: "Estonia" },
  { code: "LVA", label: "Lettonia" },
  { code: "LTU", label: "Lituania" },
  { code: "CYP", label: "Cipro" },
  // Extra EU
  { code: "CHE", label: "Svizzera" },
  { code: "GBR", label: "Regno Unito" },
  { code: "NOR", label: "Norvegia" },
  { code: "EU", label: "Tutta l'UE" },
];

// ---------------------------------------------------------------------------
// Industry options
// ---------------------------------------------------------------------------

export const INDUSTRIES: string[] = [
  "Tecnologia e informatica",
  "Costruzioni e ingegneria",
  "Consulenza e servizi professionali",
  "Sanità e farmaceutica",
  "Energia e utilities",
  "Trasporti e logistica",
  "Ambiente e gestione rifiuti",
  "Difesa e sicurezza",
  "Telecomunicazioni",
  "Istruzione e formazione",
  "Servizi finanziari",
  "Manifatturiero",
  "Agroalimentare",
  "Commercio",
  "Pubblica amministrazione",
  "Cultura e turismo",
];
