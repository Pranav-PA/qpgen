// Karnataka (KSEEB / KSEAB) chapter data for classes 8, 9 and 10.
//
// SOURCING RULE: chapter titles come from the KTBS textbook contents pages
// (textbooks.karnataka.gov.in). Tutoring sites are not a safe source — several
// still serve the pre-2014 Karnataka books alongside the current NCERT-aligned
// ones, so Class 8 Science shows up as both an 18- and a 23-chapter subject
// depending on the page. Where a site was used it was cross-checked against a
// second listing, and Class 10 Science additionally against the three official
// 2025-26 model question papers.
//
// KSEEB is NOT the current NCERT. Karnataka retains several chapters NCERT
// deleted in its 2023 rationalisation (Class 10: Periodic Classification of
// Elements, Sources of Energy, Sustainable Management of Natural Resources;
// Class 9: Why Do We Fall Ill, Natural Resources, Improvement in Food
// Resources) and orders Class 10 Maths differently. Both facts are fed to the
// model — see RETAINED_CHAPTER_NOTE in lib/ai/prompts.ts.

import type { Chapter, CurriculumSubject, Theme } from "./types";

/* ------------------------------------------------------------------ */
/* Science                                                             */

const CLASS_8_SCIENCE: Chapter[] = [
  { name: "Crop Production and Management", strand: "biology" },
  { name: "Microorganisms: Friend and Foe", strand: "biology" },
  { name: "Synthetic Fibres and Plastics", strand: "chemistry" },
  { name: "Materials: Metals and Non-Metals", strand: "chemistry" },
  { name: "Coal and Petroleum", strand: "chemistry" },
  { name: "Conservation of Plants and Animals", strand: "biology" },
  { name: "Force and Pressure", strand: "physics" },
  { name: "Friction", strand: "physics" },
  { name: "Sound", strand: "physics" },
  { name: "Combustion and Flame", strand: "chemistry" },
  { name: "Cell Structure and Functions", strand: "biology" },
  { name: "Reproduction in Animals", strand: "biology" },
  { name: "Reaching the Age of Adolescence", strand: "biology" },
  { name: "Chemical Effects of Electric Current", strand: "physics" },
  { name: "Some Natural Phenomena", strand: "physics" },
  { name: "Light", strand: "physics" },
  { name: "Stars and the Solar System", strand: "physics" },
  { name: "Pollution of Air and Water", strand: "biology" },
];

const CLASS_9_SCIENCE: Chapter[] = [
  { name: "Matter in Our Surroundings", strand: "chemistry" },
  { name: "Is Matter Around Us Pure", strand: "chemistry" },
  { name: "Atoms and Molecules", strand: "chemistry" },
  { name: "Structure of the Atom", strand: "chemistry" },
  { name: "The Fundamental Unit of Life", strand: "biology" },
  { name: "Tissues", strand: "biology" },
  { name: "Diversity in Living Organisms", strand: "biology" },
  { name: "Motion", strand: "physics" },
  { name: "Force and Laws of Motion", strand: "physics" },
  { name: "Gravitation", strand: "physics" },
  { name: "Work and Energy", strand: "physics" },
  { name: "Sound", strand: "physics" },
  { name: "Why Do We Fall Ill", strand: "biology" },
  { name: "Natural Resources", strand: "biology" },
  { name: "Improvement in Food Resources", strand: "biology" },
];

/**
 * SSLC Science allocates marks by THEME, not by chapter — a deliberate 2019-20
 * change so that teachers stop drilling the high-scoring chapters. Source: the
 * official "S.S.L.C. Question Paper Format 2024-2025 — Science" document.
 *
 * These totals reconcile exactly with the three 2025-26 model papers, which is
 * the strongest evidence available that they still hold:
 *   Materials in Daily Life 25                  -> Chemistry  25
 *   Natural Phenomena 13 + How Things Work 14   -> Physics    27
 *   The Living World 25 + Natural Resources 3   -> Biology    28
 */
const SCIENCE_10_THEMES: Theme[] = [
  { id: "materials", name: "Materials in Daily Life", marks: 25 },
  { id: "living_world", name: "The Living World", marks: 25 },
  { id: "natural_phenomena", name: "Natural Phenomena", marks: 13 },
  { id: "how_things_work", name: "How Things Work", marks: 14 },
  { id: "natural_resources", name: "Natural Resources", marks: 3 },
];

/**
 * Chapters excluded from SSLC learning and assessment. The textbook still
 * contains them, so they stay listed here and a teacher can add one back for a
 * school test — but they are off by default and the model is told they are out
 * of scope, because all three 2025-26 model papers avoid them completely.
 */
const OMITTED = "Omitted from SSLC assessment (2024-25 question paper format)";

/** Closed list of diagrams a student may be asked to draw — from the same document. */
const CLASS_10_SCIENCE: Chapter[] = [
  {
    name: "Chemical Reactions and Equations", strand: "chemistry", theme: "materials",
    drawable_figures: ["Electrolysis of water"],
  },
  {
    name: "Acids, Bases and Salts", strand: "chemistry", theme: "materials",
    drawable_figures: [
      "Reaction of zinc granules with dilute sulphuric acid and testing hydrogen gas by burning",
    ],
  },
  {
    name: "Metals and Non-metals", strand: "chemistry", theme: "materials",
    drawable_figures: ["Action of steam on a metal", "Electrolytic refining of copper"],
  },
  { name: "Carbon and Its Compounds", strand: "chemistry", theme: "materials" },
  {
    name: "Periodic Classification of Elements", strand: "chemistry", excluded: OMITTED,
  },
  {
    name: "Life Processes", strand: "biology", theme: "living_world",
    drawable_figures: [
      "Opened and closed stomata",
      "Sectional view of the human heart",
      "Structure of a nephron",
    ],
  },
  {
    name: "Control and Coordination", strand: "biology", theme: "living_world",
    drawable_figures: ["The human brain"],
  },
  {
    name: "How do Organisms Reproduce?", strand: "biology", theme: "living_world",
    drawable_figures: ["Germination of pollen on stigma"],
  },
  // The textbook chapter is "Heredity and Evolution"; the 2024-25 format lists
  // it as "Heredity" only, so evolution content is outside the exam.
  {
    name: "Heredity and Evolution", strand: "biology", theme: "living_world",
  },
  {
    name: "Light Reflection and Refraction", strand: "physics", theme: "natural_phenomena",
    drawable_figures: [
      "Ray diagrams of images formed by a concave mirror",
      "Nature, position and size of images formed by a convex lens for different object positions",
    ],
  },
  {
    name: "Human Eye and Colourful World", strand: "physics", theme: "natural_phenomena",
    drawable_figures: ["Recombination of the spectrum of white light"],
  },
  {
    name: "Electricity", strand: "physics", theme: "how_things_work",
    drawable_figures: [
      "A simple electric circuit",
      "Symbols commonly used in electrical circuits",
      "Resistors in series",
      "Resistors in parallel",
    ],
  },
  {
    name: "Magnetic Effects of Electric Current", strand: "physics", theme: "how_things_work",
    drawable_figures: [
      "Concentric field lines of the magnetic field around a straight current-carrying wire",
    ],
  },
  { name: "Sources of Energy", strand: "physics", excluded: OMITTED },
  { name: "Our Environment", strand: "biology", theme: "natural_resources" },
  {
    name: "Sustainable Management of Natural Resources", strand: "biology", excluded: OMITTED,
  },
];

/* ------------------------------------------------------------------ */
/* Mathematics                                                         */

const CLASS_8_MATHS: Chapter[] = [
  { name: "Rational Numbers" },
  { name: "Linear Equations in One Variable" },
  { name: "Understanding Quadrilaterals" },
  { name: "Practical Geometry" },
  { name: "Data Handling" },
  { name: "Squares and Square Roots" },
  { name: "Cubes and Cube Roots" },
  { name: "Comparing Quantities" },
  { name: "Algebraic Expressions and Identities" },
  { name: "Visualising Solid Shapes" },
  { name: "Mensuration" },
  { name: "Exponents and Powers" },
  { name: "Direct and Inverse Proportions" },
  { name: "Factorisation" },
  { name: "Introduction to Graphs" },
  { name: "Playing with Numbers" },
];

const CLASS_9_MATHS: Chapter[] = [
  { name: "Number Systems" },
  { name: "Introduction to Euclid's Geometry" },
  { name: "Lines and Angles" },
  { name: "Polynomials" },
  { name: "Triangles" },
  { name: "Constructions" },
  { name: "Quadrilaterals" },
  { name: "Heron's Formula" },
  { name: "Coordinate Geometry" },
  { name: "Linear Equations in Two Variables" },
  { name: "Areas of Parallelograms and Triangles" },
  { name: "Circles" },
  { name: "Surface Areas and Volumes" },
  { name: "Statistics" },
  { name: "Probability" },
];

/**
 * Karnataka orders Class 10 Maths differently from NCERT — Arithmetic
 * Progressions is Chapter 1 and Real Numbers is Chapter 8, not the reverse.
 * Kept in the printed order so a teacher scanning the list recognises their
 * own textbook.
 */
const CLASS_10_MATHS: Chapter[] = [
  { name: "Arithmetic Progressions", marks_weightage: 6 },
  { name: "Triangles", marks_weightage: 8 },
  { name: "Pair of Linear Equations in Two Variables", marks_weightage: 8 },
  { name: "Circles", marks_weightage: 4 },
  { name: "Areas Related to Circles", marks_weightage: 5 },
  { name: "Constructions", marks_weightage: 4 },
  { name: "Coordinate Geometry", marks_weightage: 6 },
  { name: "Real Numbers", marks_weightage: 4 },
  { name: "Polynomials", marks_weightage: 5 },
  { name: "Quadratic Equations", marks_weightage: 6 },
  { name: "Introduction to Trigonometry", marks_weightage: 6 },
  { name: "Some Applications of Trigonometry", marks_weightage: 4 },
  { name: "Statistics", marks_weightage: 5 },
  { name: "Probability", marks_weightage: 3 },
  { name: "Surface Areas and Volumes", marks_weightage: 7 },
];

/* ------------------------------------------------------------------ */
/* Social Science                                                      */

const CLASS_8_SOCIAL: Chapter[] = [
  { name: "Sources", strand: "history" },
  { name: "Geographical Features and Pre-Historic India", strand: "history" },
  { name: "Ancient Civilizations of India", strand: "history" },
  { name: "Ancient Civilizations of the World", strand: "history" },
  { name: "Greek, Roman and American Civilizations", strand: "history" },
  { name: "Rise of Jainism and Buddhism", strand: "history" },
  { name: "Mauryas and Kushans", strand: "history" },
  { name: "The Guptas and Vardhanas", strand: "history" },
  { name: "South India — Shatavahanas, Kadambas and Gangas", strand: "history" },
  { name: "The Chalukyas of Badami and the Pallavas of Kanchi", strand: "history" },
  { name: "The Rashtrakutas of Manyakheta and the Chalukyas of Kalyana", strand: "history" },
  { name: "The Cholas and the Hoysalas of Dwarasamudra", strand: "history" },
  { name: "Meaning and Importance of Political Science", strand: "political_science" },
  { name: "Public Administration", strand: "political_science" },
  { name: "Human Rights", strand: "political_science" },
  { name: "Local Government", strand: "political_science" },
  { name: "Introduction to Sociology", strand: "sociology" },
  { name: "Culture", strand: "sociology" },
  { name: "Social Institutions", strand: "sociology" },
  { name: "Types of Society", strand: "sociology" },
  { name: "The Earth — Our Living Planet", strand: "geography" },
  { name: "Lithosphere", strand: "geography" },
  { name: "Atmosphere", strand: "geography" },
  { name: "Hydrosphere", strand: "geography" },
  { name: "Biosphere", strand: "geography" },
  { name: "Introduction to Economics", strand: "economics" },
  { name: "Meaning and Types of Economics", strand: "economics" },
  { name: "National Income and Sectoral Aspects of the Indian Economy", strand: "economics" },
  { name: "Government and the Economy", strand: "economics" },
  { name: "Components of Business Studies", strand: "business_studies" },
  { name: "Business and Industry", strand: "business_studies" },
  { name: "Forms of Business Organisations", strand: "business_studies" },
];

const CLASS_9_SOCIAL: Chapter[] = [
  { name: "Christianity and Islam", strand: "history" },
  { name: "Medieval India and Political Transition", strand: "history" },
  { name: "Religious Promoters and Social Reformers", strand: "history" },
  { name: "Vijayanagara and Bahamani Kingdoms", strand: "history" },
  { name: "The Mughals and the Marathas", strand: "history" },
  { name: "Bhakti Panth", strand: "history" },
  { name: "Europe in the Middle Ages", strand: "history" },
  { name: "Modern Europe", strand: "history" },
  { name: "Revolution and Unification of Nations", strand: "history" },
  { name: "Our Constitution", strand: "political_science" },
  { name: "The Union Government", strand: "political_science" },
  { name: "State Government", strand: "political_science" },
  { name: "Judicial System", strand: "political_science" },
  { name: "Indian Election System", strand: "political_science" },
  { name: "Defence of the Nation", strand: "political_science" },
  { name: "National Integration", strand: "political_science" },
  { name: "Family", strand: "sociology" },
  { name: "Socialisation", strand: "sociology" },
  { name: "Social Change", strand: "sociology" },
  { name: "Community", strand: "sociology" },
  { name: "Our State — Karnataka", strand: "geography" },
  { name: "Physiographic Divisions of Karnataka", strand: "geography" },
  { name: "Climate, Soil, Natural Vegetation and Animals of Karnataka", strand: "geography" },
  { name: "Water Resources of Karnataka", strand: "geography" },
  { name: "Land Resources of Karnataka", strand: "geography" },
  { name: "Mineral Resources", strand: "geography" },
  { name: "Transport", strand: "geography" },
  { name: "Industries of Karnataka", strand: "geography" },
  { name: "Major Tourist Centres of Karnataka", strand: "geography" },
  { name: "Population of Karnataka", strand: "geography" },
  { name: "Natural Resources", strand: "economics" },
  { name: "Human Resources of India", strand: "economics" },
  { name: "Poverty and Hunger", strand: "economics" },
  { name: "Labour and Employment", strand: "economics" },
  { name: "Management of Business", strand: "business_studies" },
  { name: "Financial Management", strand: "business_studies" },
  { name: "Accounting in Business", strand: "business_studies" },
];

const CLASS_10_SOCIAL: Chapter[] = [
  { name: "Advent of Europeans to India", strand: "history" },
  { name: "The Extension of British Rule", strand: "history" },
  { name: "The Impact of British Rule in India", strand: "history" },
  { name: "Opposition to British Rule in Karnataka", strand: "history" },
  { name: "Social and Religious Reformation Movements", strand: "history" },
  { name: "The First War of Indian Independence (1857)", strand: "history" },
  { name: "Freedom Movement", strand: "history" },
  { name: "Era of Gandhi and the National Movement", strand: "history" },
  { name: "Post Independent India", strand: "history" },
  { name: "The Political Developments of the 20th Century", strand: "history" },
  { name: "The Problems of India and their Solutions", strand: "political_science" },
  { name: "Indian Foreign Policy", strand: "political_science" },
  { name: "India's Relationship with Other Countries", strand: "political_science" },
  { name: "Global Problems and India's Role", strand: "political_science" },
  { name: "International Institutions", strand: "political_science" },
  { name: "Social Stratification", strand: "sociology" },
  { name: "Labour", strand: "sociology" },
  { name: "Social Movements", strand: "sociology" },
  { name: "Social Problems", strand: "sociology" },
  { name: "Indian Position and Extension", strand: "geography" },
  { name: "Indian Physiography", strand: "geography" },
  { name: "Indian Climate", strand: "geography" },
  { name: "Indian Soils", strand: "geography" },
  { name: "Indian Forest Resources", strand: "geography" },
  { name: "Indian Water Resources", strand: "geography" },
  { name: "Indian Land Resources", strand: "geography" },
  { name: "Indian Mineral and Power Resources", strand: "geography" },
  { name: "Indian Transport and Communication", strand: "geography" },
  { name: "Indian Industries", strand: "geography" },
  { name: "Indian Natural Disasters", strand: "geography" },
  { name: "Indian Population", strand: "geography" },
  { name: "Development", strand: "economics" },
  { name: "Rural Development", strand: "economics" },
  { name: "Money and Credit", strand: "economics" },
  { name: "Public Finance and Budget", strand: "economics" },
  { name: "Bank Transactions", strand: "business_studies" },
  { name: "Entrepreneurship", strand: "business_studies" },
  { name: "Globalization of Business", strand: "business_studies" },
  { name: "Consumer Education and Protection", strand: "business_studies" },
];

/* ------------------------------------------------------------------ */

const SCIENCE_STRANDS = ["physics", "chemistry", "biology"] as const;
const SOCIAL_STRANDS = [
  "history",
  "political_science",
  "sociology",
  "geography",
  "economics",
  "business_studies",
] as const;

/**
 * Keys are `{class}-{subject}` and are persisted in PaperSettings.curriculum —
 * changing one orphans existing papers, so add rather than rename.
 */
export const KSEEB_SUBJECTS: CurriculumSubject[] = [
  {
    key: "8-science",
    label: "Science",
    board: "KSEEB",
    class_level: 8,
    strand_order: [...SCIENCE_STRANDS],
    chapters: CLASS_8_SCIENCE,
  },
  {
    key: "8-maths",
    label: "Mathematics",
    board: "KSEEB",
    class_level: 8,
    chapters: CLASS_8_MATHS,
  },
  {
    key: "8-social-science",
    label: "Social Science",
    board: "KSEEB",
    class_level: 8,
    strand_order: [...SOCIAL_STRANDS],
    chapters: CLASS_8_SOCIAL,
  },
  {
    key: "9-science",
    label: "Science",
    board: "KSEEB",
    class_level: 9,
    strand_order: [...SCIENCE_STRANDS],
    chapters: CLASS_9_SCIENCE,
  },
  {
    key: "9-maths",
    label: "Mathematics",
    board: "KSEEB",
    class_level: 9,
    chapters: CLASS_9_MATHS,
  },
  {
    key: "9-social-science",
    label: "Social Science",
    board: "KSEEB",
    class_level: 9,
    strand_order: [...SOCIAL_STRANDS],
    chapters: CLASS_9_SOCIAL,
  },
  {
    key: "10-science",
    label: "Science",
    board: "KSEEB",
    class_level: 10,
    description:
      "One SSLC paper printed as three parts — Part A Physics, Part B Chemistry, Part C Biology.",
    strand_order: [...SCIENCE_STRANDS],
    themes: SCIENCE_10_THEMES,
    // Published in the 2024-25 question paper format, not a house default.
    difficulty: { easy_pct: 30, medium_pct: 50, hard_pct: 20 },
    chapters: CLASS_10_SCIENCE,
  },
  {
    key: "10-maths",
    label: "Mathematics",
    board: "KSEEB",
    class_level: 10,
    chapters: CLASS_10_MATHS,
  },
  {
    key: "10-social-science",
    label: "Social Science",
    board: "KSEEB",
    class_level: 10,
    description:
      "One SSLC paper covering six branches — History, Political Science, Sociology, Geography, Economics and Business Studies.",
    strand_order: [...SOCIAL_STRANDS],
    chapters: CLASS_10_SOCIAL,
  },
];

/**
 * Chapters Karnataka still teaches that current NCERT has dropped. Named to the
 * model explicitly, because a model grounded on post-2023 NCERT will otherwise
 * treat them as out of syllabus and refuse or under-generate.
 *
 * Class 10 is deliberately absent. Its three NCERT-deleted chapters (Periodic
 * Classification of Elements, Sources of Energy, Sustainable Management of
 * Natural Resources) are in the KTBS textbook but OUT of SSLC assessment per
 * the 2024-25 question paper format, and all three 2025-26 model papers avoid
 * them — so they are marked `excluded` on the chapter instead. Being in the
 * textbook and being examinable are different things; do not conflate them.
 *
 * Class 9 has no board exam and no published exclusions, so its textbook
 * contents and its examinable scope are the same thing.
 */
export const KSEEB_RETAINED_CHAPTERS: Record<number, string[]> = {
  9: ["Why Do We Fall Ill", "Natural Resources", "Improvement in Food Resources"],
};
