---
name: SoundRig
description: A soundcheck pressing room for recorded game effects.
colors:
  paper: "#f2eadc"
  ink: "#20221c"
  accent: "#df6a39"
  sage: "#c0c1aa"
  muted: "#56534b"
  line: "#858274"
  white: "#fff9f2"
  quiet: "#eee0cf"
  hover: "#cd5726"
  focus: "#793b21"
  error: "#8b2c17"
typography:
  display:
    fontFamily: "SoundRigDisplay, system-ui, sans-serif"
    fontSize: "clamp(60px, 10.96vw, 163px)"
    fontWeight: 400
    lineHeight: 0.83
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "SoundRigDisplay, system-ui, sans-serif"
    fontSize: "clamp(34px, 4.1vw, 62px)"
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: "-0.04em"
  guide-title:
    fontFamily: "SoundRigDisplay, system-ui, sans-serif"
    fontSize: "clamp(40px, 6vw, 80px)"
    fontWeight: 400
    lineHeight: 1.06
    letterSpacing: "-0.04em"
  title:
    fontFamily: "SoundRigDisplay, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  body:
    fontFamily: "DM, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "DM, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.5
  data:
    fontFamily: "ui-monospace, monospace"
    fontSize: "12px"
    lineHeight: 1.6
rounded:
  portable: "4px"
  control: "6px"
  selector: "10px"
  listening-action: "12px"
  action: "14px"
  circle: "50%"
spacing:
  compact: "8px"
  control: "12px"
  related: "18px"
  group: "24px"
  workspace: "34px"
  section: "60px"
components:
  button-marketing:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.white}"
    rounded: "{rounded.action}"
    padding: "12px 24px"
  button-marketing-hover:
    backgroundColor: "{colors.hover}"
  button-studio:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "11px 14px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "11px 14px"
  button-secondary-hover:
    backgroundColor: "{colors.sage}"
  field:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  cue-selector:
    backgroundColor: "{colors.sage}"
    textColor: "{colors.ink}"
    rounded: "{rounded.selector}"
    padding: "5px 8px"
  cue-selector-selected:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.white}"
  version-selector-selected:
    backgroundColor: "{colors.sage}"
    textColor: "{colors.ink}"
  play-control:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.circle}"
    width: "52px"
    height: "52px"
---

# Design System: SoundRig

## Overview

**Creative North Star: "Soundcheck pressing room"**

SoundRig borrows the physical confidence of a test-pressing sleeve: warm paper, orange ink, oversized lettering and a dimensional record. The typography and working audio comparison carry the identity. The artwork supplies atmosphere while native controls carry every action.

The landing page is expansive, the studio is dense enough for repeated work, and the guide is paced for reading. They share the same paper, ink, display face, restrained curves and thin separators.

**Key Characteristics:**
- Warm neutral paper with a subdued raster grain.
- Rounded-dot display lettering paired with clear sans-serif controls.
- Orange actions, sage comparison states and factual audio feedback.
- Flat working surfaces separated by rules.
- Listening controls before artwork on phones and tablets.

## Colors

The palette resembles a printed sleeve: dark ink and orange on warm neutral paper, with sage as a quiet comparison color.

### Primary

- **Pressing Orange — accent:** Main actions, selected game cues, playback progress, carets and native range/checkbox accents.
- **Burnt Orange — hover:** Hover treatment for marketing buttons.

### Secondary

- **Sleeve Sage — sage:** Unselected game cues, selected playback versions and studio secondary-button hover.

### Neutral

- **Warm Paper — paper:** Page canvas and the backing beneath the paper texture.
- **Printing Ink — ink:** Headlines, body text, strong rules and the circular play control.
- **Soft Ink — muted:** Supporting text and factual status details.
- **Rule Gray — line:** Field outlines and secondary separators.
- **Chalk — white:** Field interiors and marketing-action text.
- **Paper Wash — quiet:** Bindings, code, diffs and diagnostic surfaces.
- **Focus Brown — focus:** Visible keyboard outlines.
- **Error Rust — error:** Failed or invalid states, accompanied by explanatory text.

**The Paper Rule.** Keep paper neutral and legible beneath the texture. The shipped surface places a translucent paper-colored layer over the raster grain; the grain must not become a yellow cast.

## Typography

**Display Font:** SoundRig Display, served locally as `SoundRigDisplay`, with a sans-serif fallback.  
**Body Font:** DM Sans, served locally as `DM`, with a sans-serif fallback.  
**Data Font:** UI monospace.

The display face is an OFL derivative of Archivo Black, retaining its heavy sleeve lettering while rounding the i tittle and period. DM Sans carries the working interface without competing with it. The original font, derivative recipe, provenance and license remain in the project.

### Hierarchy

- **Display:** The landing headline uses the frontmatter display role. At phone widths it becomes `clamp(34px, 9.8vw, 74px)` with a looser line height (`0.96`); at very wide widths it becomes `11vw`. The first line is slightly compressed horizontally above phone widths.
- **Headline:** The studio page title uses the headline role. At the smallest breakpoint it is `(36px)` with a compact measure `(12ch)`.
- **Guide title:** The guide uses its own fluid title role with a maximum measure `(16ch)`.
- **Title:** Studio section headings use the title role. Larger grouping titles use `(26–30px)`. Landing story headings remain fluid and use the same display face.
- **Body:** The shared base is the body role. Landing story copy grows to `(18px)` on larger screens; guide paragraphs and lists stay within `(70ch)`.
- **Label:** Studio field labels use the label role. Supporting interface text commonly uses `(11–14px)`.
- **Data:** Monospace belongs to bindings, JSON and integration examples. Timings and live values use tabular numerals.

**The Sleeve Type Rule.** Use SoundRig Display for identity and headings; keep control labels, explanations and operational state in DM Sans. Portable hosts retain the local display face for their title and use a system sans-serif body.

## Layout

The shared header and landing sections use proportional side margins `(2.4%)`, increasing to `(5%)` on phones. Thin horizontal rules establish the section rhythm. Content is grouped through space and alignment rather than repeated cards.

The studio has a centered maximum width `(1480px)`. Above `(900px)`, the game and editor form a `1.5fr / minmax(350px, 1fr)` grid with a gap `(32px)` and a vertical separator; the intermediate desktop uses a narrower variant. The game keeps its `(4:3)` viewport. At and below `(900px)`, the game precedes the editor. Capture/comparison and saved checks form a separate lower grid, stacking below `(900px)`.

The guide has a maximum width `(1220px)`, generous desktop padding `(70px 30px)` and readable paragraph measures. Its table of contents wraps naturally.

The observed spacing vocabulary is deliberately mixed: compact control gaps, modest group spacing and larger ruled sections. Use the frontmatter spacing values as recurring anchors rather than forcing all dimensions onto an invented modular scale.

Responsive behavior:
- At and below `(1100px)`, the landing becomes a vertical flow: headline, introduction, studio action, full-width audio comparison, then record artwork. The tablet record is a partial arc, offset to the right.
- At and below `(1000px)`, the studio and lower landing editorial columns stack.
- At and below `(760px)`, the header wraps, its additional studio-action link is hidden, margins widen proportionally, typography reduces and selectors become more compact.
- At and below `(560px)`, studio controls wrap more freely, volume gets a full row and behavioral results become a single column.
- At and above `(1600px)`, the landing headline scales with the viewport and the audio comparison is capped `(860px)`.

**The Controls First Rule.** On phones and tablets, keep audio comparison and the studio action before the record artwork.

## Elevation & Depth

Working UI is flat: there are no CSS box shadows. Rules, paper wash and tonal changes separate information. The record raster supplies the landing's physical volume and lighting; do not translate its dimensional appearance into raised interface panels.

**The Flat Workbench Rule.** Keep controls and working sections on the paper plane. Use thin separators and quiet fills to express grouping.

## Shapes

The record, brand mark and play button share circular geometry. Rectangular controls use restrained curves: the studio uses the control radius, portable hosts use the smaller portable radius, cue selectors use the selector radius and marketing actions use the action radius. The large listening action has its own intermediate radius.

Fields and most working controls use one-pixel borders. Landing selectors and actions have more generous silhouettes; studio controls stay compact. The game viewport clips its contents within a small radius.

## Components

### Buttons

Marketing actions are broad orange shapes with chalk text and bold sans-serif labels. Their hover color deepens; pressing moves them down `(1px)`.

Studio primary actions use orange with ink text. Hover retains orange and adds an ink border. Secondary studio buttons are transparent at rest and sage on hover. Standard studio padding is recorded in the frontmatter; gameplay and movement controls have a minimum height `(44px)`.

Shared keyboard focus is a visible brown outline `(3px)` with an offset `(4px)`. Disabled shared buttons use reduced opacity `(0.45)` and a wait cursor. Portable hosts retain their compact local control treatment.

Color and transform transitions are short `(0.18s ease)`. Reduced-motion preference removes CSS animation, transitions and smooth scrolling.

### Cue and Version Selectors

The listening comparison uses native radios inside labeled groups. Cue options are sage at rest and orange when selected. Version options are outlined at rest and sage when selected. At and below the tablet breakpoint, selected radio text uses ink. Focus is drawn around the visible radio label, not its visually hidden input.

The selector row pairs a fixed-width descriptive label with flexible options. Phone labels and corner radii become smaller without changing the native selection behavior.

### Inputs and Fields

Text fields, selects and textareas use chalk interiors, ink text, one-pixel rule-gray outlines and the studio control radius. Textareas resize vertically. Range controls and checkboxes use orange as their native accent. Errors combine rust text with an explanation; color alone does not carry the failure.

### Working Containers

Bindings, code and diffs use paper wash. Projects, replay, saved checks and delivery are flat sections with ruled boundaries. Technical details use native disclosures, keeping JSON and wiring below the primary task. Long code and source notes wrap; diagnostic areas may scroll within a bounded height.

### Navigation

The header pairs the circular record mark with the display wordmark. Text navigation uses DM Sans; hover and the current page are underlined. The studio's in-page workflow links use orange bottom rules. Footer links are smaller and wrap when needed.

### Listening Comparison

The circular ink play button sits beside elapsed time, the waveform and duration. The waveform is drawn from the selected cue's peak data; orange indicates elapsed playback and sage indicates the remaining waveform.

Playback begins from an explicit user action. Changing cue or version stops the previous playback; hiding or leaving the page also stops it. The play button's accessible label changes with state. Loading and errors are announced in a status region. The waveform remains functional playback feedback when reduced motion is requested.

### Portable Hosts

The standalone runner, workflow runner and delivered-sprite consumer carry the warm paper, ink and local display title into independent output. They use narrower reading containers, compact native controls and simple ruled/code surfaces. Their system body fonts and smaller corner radius are scoped output variants, not replacements for the shared site typography.

## Do's and Don'ts

### Recording and cue-edit additions

Recording preparation is an inline stage inside the existing project section. Keep the pending filename/destination, RMS-comparison explanation, source warnings and explicit Use/Discard actions together. The cue editor reuses native selects, labeled number fields, ruled sections and existing buttons. Number fields use 16px body type and a minimum 44px height; paired fields remain two columns while actions wrap. Godot selection belongs inside Delivery with its static-only scope visible. These additions preserve the pressing-room palette and typography; they add no new visual world or global tokens.

### Do:
- **Do** keep warm paper, printing ink and orange as the shared visual foundation.
- **Do** retain the local SoundRig Display font and its rounded punctuation in site and portable titles.
- **Do** put audio controls before record artwork on phones and tablets.
- **Do** use native controls, explicit focus and factual playback or validation state.
- **Do** separate working sections with rules, space and quiet fills.
- **Do** preserve readable text measures and wrap long code or source notes.

### Don't:
- **Don't** turn the subdued paper grain into a strong yellow surface.
- **Don't** replace working interface text with raster artwork.
- **Don't** use the record's dimensional lighting as a reason to add shadows to controls or working panels.
- **Don't** use display lettering for dense operational text.
- **Don't** imply music generation, listening preference or product validation through the imagery or interface.

## Studio and game refinement — November 4

The studio title is a compact working header, not a second marketing hero. Native button tabs group Cues, Recordings, Meta edit and Delivery; active state uses an orange rule and weight. Arrow keys/Home/End move selection with focus. Diagnostics use disclosures. The game is Pressing Room Run: a warm factory scene with sage windows, orange conveyor shelves, a courier, record masters and a rolling press. Canvas artwork is authored game content; semantic DOM exposes objectives, count, outcome, pause and restart. Game movement remains functional under reduced motion; nonessential bursts and press rotation stop. The approved landing identity and its image remain unchanged.

## Saved revision checkpoints

Revisions is a fifth native tab in the existing studio. Named checkpoints use quiet dated rows; Inspect brings a selected heading, exact current/saved field table and protection/recovery policy into view. Restore is a deliberate orange action. Remove uses a separate explicit inline confirmation. Quota, runtime-load limits and UNCHECKED state use factual text. No cloud, autosave or preference claims are implied.
