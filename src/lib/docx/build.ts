import {
  AlignmentType,
  BorderStyle,
  Document,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { Paper, Question } from "@/lib/types";
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

function letterhead(paper: Paper, docLabel?: string): Paragraph[] {
  const inst = paper.institution_details;
  const meta: string[] = [];
  if (inst.exam_date) meta.push(`Date: ${fmtDate(inst.exam_date)}`);
  if (inst.exam_time) meta.push(`Time: ${inst.exam_time}`);
  meta.push(`Duration: ${inst.duration_minutes} minutes`);
  meta.push(`Maximum marks: ${inst.max_marks}`);

  const out: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: inst.name, bold: true, size: 32 })],
    }),
  ];
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
  if ((q.type === "mcq" || q.type === "assertion_reason") && q.options) {
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

export function buildQuestionPaperDocx(paper: Paper): Document {
  const inst = paper.institution_details;
  const children: (Paragraph | Table)[] = [...letterhead(paper)];

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

  paper.questions.forEach((q, i) => children.push(...questionBlock(q, i, true)));

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

export function buildAnswerKeyDocx(paper: Paper): Document {
  const children: (Paragraph | Table)[] = [...letterhead(paper, "ANSWER KEY")];

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

  // Quick-reference grid, 5 answers per row.
  const perRow = 5;
  const rows: TableRow[] = [];
  for (let i = 0; i < paper.questions.length; i += perRow) {
    const slice = paper.questions.slice(i, i + perRow);
    rows.push(
      new TableRow({
        children: slice.map(
          (q, j) =>
            new TableCell({
              width: { size: 20, type: WidthType.PERCENTAGE },
              margins: { top: 60, bottom: 60, left: 100, right: 100 },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: `${i + j + 1}. `, bold: true }),
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
  }

  children.push(
    new Paragraph({
      spacing: { before: 240, after: 80 },
      children: [new TextRun({ text: "Worked solutions", bold: true, size: 24 })],
    })
  );

  paper.questions.forEach((q, i) => {
    children.push(
      new Paragraph({
        spacing: { before: 160, after: 40 },
        children: [
          new TextRun({ text: `Q${i + 1} — Answer: `, bold: true }),
          ...textWithMathRuns(q.correct_answer, { bold: true }),
        ],
      }),
      new Paragraph({
        spacing: { after: 60 },
        children: textWithMathRuns(q.solution),
      })
    );
  });

  return new Document({
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [{ children }],
  });
}
