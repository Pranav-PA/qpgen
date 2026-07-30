import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { groupBySection } from "@/lib/sections";
import { hasOptions, type Paper, type Question } from "@/lib/types";
import { fetchLogo, type LogoAsset } from "./image";
import { textWithMathRuns } from "./math";

const LETTERS = ["A", "B", "C", "D"];

function fmtDate(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function letterhead(
  paper: Paper,
  logo: LogoAsset | null,
  docLabel?: string
): Paragraph[] {
  const inst = paper.institution_details;
  const meta: string[] = [];
  if (inst.exam_date) meta.push(`Date: ${fmtDate(inst.exam_date)}`);
  if (inst.exam_time) meta.push(`Time: ${inst.exam_time}`);
  meta.push(`Duration: ${inst.duration_minutes} minutes`);
  meta.push(`Maximum marks: ${inst.max_marks}`);

  const out: Paragraph[] = [];

  if (logo) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
        children: [
          new ImageRun({
            data: logo.data,
            type: logo.type,
            transformation: { width: logo.width, height: logo.height },
          }),
        ],
      })
    );
  }

  out.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: inst.name, bold: true, size: 32 })],
    })
  );
  if (inst.address) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: inst.address, size: 20, color: "444444" })],
      })
    );
  }
  out.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120 },
      children: [
        new TextRun({
          text: docLabel ? `${inst.exam_title} — ${docLabel}` : inst.exam_title,
          bold: true,
          size: 26,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: `${paper.subject} · ${paper.chapters.join(", ")}`,
          size: 20,
          color: "444444",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" } },
      spacing: { after: 160 },
      children: [new TextRun({ text: meta.join("   |   "), size: 20 })],
    })
  );
  return out;
}

function sectionHeading(heading: string, instruction: string | null): Paragraph[] {
  const out = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 240, after: instruction ? 20 : 100 },
      border: {
        top: { style: BorderStyle.SINGLE, size: 6, color: "000000" },
        bottom: instruction
          ? undefined
          : { style: BorderStyle.SINGLE, size: 6, color: "000000" },
      },
      keepNext: true,
      children: [new TextRun({ text: heading, bold: true, size: 24 })],
    }),
  ];
  if (instruction) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" } },
        keepNext: true,
        children: [new TextRun({ text: instruction, italics: true, size: 19 })],
      })
    );
  }
  return out;
}

function questionBlock(q: Question, index: number, withMarks: boolean): Paragraph[] {
  const out: Paragraph[] = [
    new Paragraph({
      spacing: { before: 200, after: 60 },
      children: [
        new TextRun({ text: `Q${index + 1}. `, bold: true }),
        ...textWithMathRuns(q.question_text),
        ...(withMarks
          ? [new TextRun({ text: `   [${q.marks} mark${q.marks === 1 ? "" : "s"}]`, color: "666666", size: 18 })]
          : []),
      ],
    }),
  ];
  if (hasOptions(q.type) && q.options) {
    q.options.forEach((opt, oi) => {
      out.push(
        new Paragraph({
          indent: { left: 480 },
          spacing: { after: 40 },
          children: [
            new TextRun({ text: `(${LETTERS[oi]}) `, bold: true }),
            ...textWithMathRuns(opt),
          ],
        })
      );
    });
  }
  return out;
}

export async function buildQuestionPaperDocx(paper: Paper): Promise<Document> {
  const inst = paper.institution_details;
  const logo = await fetchLogo(inst.logo_url);
  const children: (Paragraph | Table)[] = [...letterhead(paper, logo)];

  if (inst.instructions.trim()) {
    children.push(
      new Paragraph({
        spacing: { after: 60 },
        children: [new TextRun({ text: "General instructions:", bold: true, size: 20 })],
      })
    );
    inst.instructions
      .split("\n")
      .filter((l) => l.trim())
      .forEach((line) =>
        children.push(
          new Paragraph({
            spacing: { after: 30 },
            children: [new TextRun({ text: line.trim(), size: 20 })],
          })
        )
      );
  }

  for (const group of groupBySection(paper)) {
    if (group.heading) {
      children.push(...sectionHeading(group.heading, group.instruction));
    }
    group.questions.forEach((q, i) =>
      children.push(...questionBlock(q, group.startIndex - 1 + i, true))
    );
  }

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 400 },
      children: [new TextRun({ text: "— End of question paper —", italics: true, color: "666666", size: 20 })],
    })
  );

  return new Document({
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [{ children }],
  });
}

export async function buildAnswerKeyDocx(paper: Paper): Promise<Document> {
  const logo = await fetchLogo(paper.institution_details.logo_url);
  const children: (Paragraph | Table)[] = [
    ...letterhead(paper, logo, "ANSWER KEY"),
  ];

  children.push(
    new Paragraph({
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: "For teacher use only — do not distribute with the question paper.",
          italics: true,
          color: "AA0000",
          size: 20,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 80 },
      children: [new TextRun({ text: "Quick answers", bold: true, size: 24 })],
    })
  );

  const groups = groupBySection(paper);

  // Quick-reference grid, 5 per row. Descriptive answers are prose, so only
  // objective questions belong here.
  const quick = groups.flatMap((g) =>
    g.questions
      .map((q, i) => ({ q, n: g.startIndex + i }))
      .filter(({ q }) => hasOptions(q.type) || q.type === "numerical")
  );

  const perRow = 5;
  const rows: TableRow[] = [];
  for (let i = 0; i < quick.length; i += perRow) {
    const slice = quick.slice(i, i + perRow);
    rows.push(
      new TableRow({
        children: slice.map(
          ({ q, n }) =>
            new TableCell({
              width: { size: 20, type: WidthType.PERCENTAGE },
              margins: { top: 60, bottom: 60, left: 100, right: 100 },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: `${n}. `, bold: true }),
                    new TextRun({ text: q.correct_answer }),
                  ],
                }),
              ],
            })
        ),
      })
    );
  }
  if (rows.length > 0) {
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }));
  } else {
    children.push(
      new Paragraph({
        spacing: { after: 60 },
        children: [
          new TextRun({
            text: "This paper is entirely descriptive — see the worked solutions below.",
            italics: true,
            size: 20,
          }),
        ],
      })
    );
  }

  children.push(
    new Paragraph({
      spacing: { before: 240, after: 80 },
      children: [new TextRun({ text: "Worked solutions", bold: true, size: 24 })],
    })
  );

  for (const group of groups) {
    if (group.heading) {
      children.push(
        new Paragraph({
          spacing: { before: 220, after: 60 },
          keepNext: true,
          children: [new TextRun({ text: group.heading, bold: true, size: 22 })],
        })
      );
    }
    group.questions.forEach((q, i) => {
    children.push(
      new Paragraph({
        spacing: { before: 160, after: 40 },
        children: [
          new TextRun({ text: `Q${group.startIndex + i} — Answer: `, bold: true }),
          ...textWithMathRuns(q.correct_answer, { bold: true }),
          new TextRun({
            text: `   [${q.marks} mark${q.marks === 1 ? "" : "s"}]`,
            color: "666666",
            size: 18,
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 60 },
        children: textWithMathRuns(q.solution),
      })
    );
    });
  }

  return new Document({
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [{ children }],
  });
}
