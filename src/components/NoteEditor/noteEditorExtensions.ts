import type { Extensions } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import { TextStyle, Color, FontSize } from '@tiptap/extension-text-style';
import { ResizableImage } from './extensions/ResizableImage';
import { HeadingNumbering } from './extensions/HeadingNumbering';
import { SectionDocument, Section, ColumnBlock, Column } from './extensions/Section';
import { NoteTagMark } from './extensions/NoteTagMark';
import { ArtifactLinkMark } from './extensions/ArtifactLinkMark';
import { NoteTitle } from './extensions/NoteTitle';
import { DuplicateLine } from './extensions/DuplicateLine';
import { TimelineExtensions } from './extensions/Timeline';
import { QuoteExtensions } from './extensions/Quote';
import { ConclusionExtensions } from './extensions/Conclusion';
import { TypesExtensions } from './extensions/Types';
import { IdKeyExtensions } from './extensions/IdKey';
import { ProsConsExtensions } from './extensions/ProsCons';
import { ArgumentExtensions } from './extensions/Argument';
import { OptionsExtensions } from './extensions/Options';
import { DesignCycle } from './extensions/designCycle';
import { NumberNotation } from './extensions/NumberNotation';
import { DictionaryWords } from './extensions/DictionaryWords';
import { CycleExtensions } from './extensions/Cycle';
import { BreakdownExtensions } from './extensions/Breakdown';
import { HierarchyExtensions } from './extensions/Hierarchy';
import { PyramidExtensions } from './extensions/Pyramid';
import { ChartExtensions } from './extensions/Chart';
import { CodeBlockExtensions } from './extensions/CodeBlock';
import { MathExtensions } from './extensions/Maths';
import { InboxExtensions } from './extensions/Inbox';
import { HubExtensions } from './extensions/Hub';
import { GlossaryCardExtensions } from './extensions/GlossaryCard';
import { GlossaryChipExtensions } from './extensions/GlossaryChip';
import { TrailingLine } from './extensions/TrailingLine';
import { QuestionExtensions } from './extensions/Question';
import { CompareExtensions } from './extensions/Compare';
import { DiagramExtensions } from './extensions/Diagram';
import { ConvertExtensions } from './extensions/Convert';
import { CaseStudyExtensions } from './extensions/CaseStudy';
import { CauseEffectExtensions } from './extensions/CauseEffect';
import { VennExtensions } from './extensions/Venn';
import { NoteBlockDelete, NoteBlockSelect } from './extensions/blockDesigns';
import { AutoBrackets } from './extensions/AutoBrackets';
import { EscapePassThrough } from './extensions/EscapePassThrough';
import { NoteBlockPicks } from './extensions/blockPicks';
import { GlossaryAutolink } from './extensions/GlossaryAutolink';
import { AcronymOffer } from './extensions/AcronymOffer';
import { UnsureFlagExtensions } from './extensions/UnsureFlag';
import { BlockOffers } from './extensions/BlockOffers';
import { OccurrenceHighlight } from './extensions/OccurrenceHighlight';
import { SpecialCharInput } from './extensions/SpecialCharInput';
import { LinkBoundary } from './extensions/LinkBoundary';
import { HeadingFold } from './extensions/HeadingFold';
import { HeadingLevel } from './extensions/HeadingLevel';
import { NoteSubtitle, NoteAuthor } from './extensions/NoteBylines';
import { ConceptRefMark, ConceptMargin } from './extensions/ConceptRef';
import { MarginColumn } from './extensions/MarginColumn';
import { NoteListItem } from './extensions/ListItem';
import { NoteObjectTrigger } from './objects/NoteObjectTrigger';
import { ArtifactLinkGroups } from './objects/artifactGroups';
import { BlockIds } from './extensions/BlockIds';
import { NoteLinkExtensions } from './extensions/NoteLink';
import { NoteEmbedExtensions } from './extensions/NoteEmbed';

// THE note editor's extensions, in order: every block, mark and behaviour a note has. NoteEditor
// builds its editor from this, and anything else that shows note content as a note shows it (the
// block guide's examples) uses the same list, so they can't drift apart. `noteEncrypted`: whether
// the open note is encrypted (pictures pasted into it are stored encrypted); `linkClass`: the
// class web links get.
export function noteEditorExtensions({ noteEncrypted, linkClass }: { noteEncrypted: () => boolean | null; linkClass: string }): Extensions {
  return [
      StarterKit.configure({ document: false, codeBlock: false, listItem: false, link: { openOnClick: false, HTMLAttributes: { class: linkClass } } }),
      LinkBoundary,
      NoteListItem,
      SectionDocument,
      Section,
      ColumnBlock,
      Column,
      Placeholder.configure({ placeholder: 'Start writing…' }),
      NoteTagMark,
      ArtifactLinkMark,
      ArtifactLinkGroups,
      NoteObjectTrigger,
      ResizableImage.configure({ allowBase64: true, inline: false, noteEncrypted }),
      Superscript,
      Subscript,
      TextStyle,
      Color,
      FontSize,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      HeadingNumbering,
      NoteTitle,
      NoteSubtitle,
      NoteAuthor,
      DuplicateLine,
      ...TimelineExtensions,
      ...QuoteExtensions,
      ...ConclusionExtensions,
      ...TypesExtensions,
      ...IdKeyExtensions,
      ...ProsConsExtensions,
      ...ArgumentExtensions,
      ...OptionsExtensions,
      DesignCycle,
      NumberNotation,
      DictionaryWords,
      ...CycleExtensions,
      ...BreakdownExtensions,
      ...HierarchyExtensions,
      ...PyramidExtensions,
      ...ChartExtensions,
      ...CodeBlockExtensions,
      ...MathExtensions,
      ...InboxExtensions,
      ...HubExtensions,
      ...GlossaryCardExtensions,
      ...GlossaryChipExtensions,
      ...QuestionExtensions,
      ...CompareExtensions,
      ...DiagramExtensions,
      ...ConvertExtensions,
      ...CaseStudyExtensions,
      ...CauseEffectExtensions,
      ...VennExtensions,
      TrailingLine,
      BlockIds,
      ...NoteLinkExtensions,
      ...NoteEmbedExtensions,
      NoteBlockSelect,
      NoteBlockDelete,
      NoteBlockPicks,
      GlossaryAutolink,
      AcronymOffer,
      ...UnsureFlagExtensions,
      BlockOffers,
      OccurrenceHighlight,
      SpecialCharInput,
      AutoBrackets,
      EscapePassThrough,
      HeadingLevel,
      HeadingFold,
      ConceptRefMark,
      ConceptMargin,
      MarginColumn,
  ];
}
