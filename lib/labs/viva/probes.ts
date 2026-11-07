// Keystone Labs · Viva Check: the probe library (pure, deterministic).
// A probe spots one design decision in a diff (an ordering, a value, a missing line) and turns it into an oral-exam
// question anchored to those exact lines, plus a three-concept rubric that never leaves the server:
//   concept 1 names the idea · concept 2 explains the mechanism · concept 3 states the consequence or trade-off.
// Each concept carries a Socratic nudge (a question) for when the answer misses it. Nudges never contain the
// answer; an eval checks that no nudge satisfies its own concept.
// Mutations (the "what if" lines shown with a question) only ever BREAK the student's code, never fix it.
import { codeLines } from "./diff";
import type { DiffLine, VivaKind, VivaQuestion } from "./model";
import { POINTS_PER_QUESTION } from "./model";

export interface Concept { id: string; label: string; re: RegExp; nudge: string }
export interface ProbeMatch { anchor: DiffLine[]; vars: Record<string, string> }
export interface Probe {
  id: string;
  kind: VivaKind;
  topic: string;
  skills: string[];
  /** Specific probes outrank generic ones. */
  weight: number;
  /** Matches the AI Tech Lead's review text when it raised the same topic. */
  reviewTerms?: RegExp;
  match(lines: DiffLine[]): ProbeMatch | null;
  prompt(m: ProbeMatch): string;
  mutation?(m: ProbeMatch): string[];
  concepts: [Concept, Concept, Concept];
}

// ---------- matchers ----------

const inFile = (re: RegExp) => (l: DiffLine) => re.test(l.file);
const code = (l: DiffLine) => l.text.trim();
const at = (l: DiffLine) => `line ${l.newLine ?? l.i + 1}`;
const tick = (s: string) => `\`${s.length > 70 ? `${s.slice(0, 67)}...` : s}\``;

function present(file: RegExp, line: RegExp) {
  return (lines: DiffLine[]): ProbeMatch | null => {
    const hit = codeLines(lines).filter(inFile(file)).find((l) => line.test(code(l)));
    return hit ? { anchor: [hit], vars: { a: at(hit), code: tick(code(hit)), file: hit.file } } : null;
  };
}

function ordered(file: RegExp, first: RegExp, then: RegExp) {
  return (lines: DiffLine[]): ProbeMatch | null => {
    const ls = codeLines(lines).filter(inFile(file));
    const a = ls.find((l) => first.test(code(l)));
    const b = a && ls.find((l) => l.i > a.i && l.file === a.file && then.test(code(l)));
    return a && b ? { anchor: [a, b], vars: { a: at(a), b: at(b), codeA: tick(code(a)), codeB: tick(code(b)), file: a.file } } : null;
  };
}

/** The file has `need` but no added line matching `missing`; anchors on the `anchor` line. */
function absent(file: RegExp, need: RegExp, missing: RegExp, anchor: RegExp) {
  return (lines: DiffLine[]): ProbeMatch | null => {
    const ls = codeLines(lines).filter(inFile(file));
    if (!ls.some((l) => need.test(code(l))) || ls.some((l) => missing.test(code(l)))) return null;
    const hit = ls.find((l) => anchor.test(code(l)));
    return hit ? { anchor: [hit], vars: { a: at(hit), code: tick(code(hit)), file: hit.file } } : null;
  };
}

const DOCKERFILE = /(^|\/)Dockerfile$/i;
const PY = /\.py$/i;
const SQL = /\.sql$/i;

// ---------- specific probes ----------

export const PROBES: Probe[] = [
  {
    id: "docker-cache-order", kind: "order", topic: "Layer caching", skills: ["docker"], weight: 3,
    reviewTerms: /layer caching|cache/i,
    match: ordered(DOCKERFILE, /^COPY\s+\.\s+\S+/i, /^RUN\s+.*(pip|npm|yarn|poetry)\s+(install|ci)/i),
    prompt: (m) => `On ${m.vars.a} of ${m.vars.file}, ${m.vars.codeA} runs before ${m.vars.codeB} on ${m.vars.b}. You change one line of api/main.py and rebuild. What does Docker do with the install step, and why does the order of these two lines decide that?`,
    concepts: [
      { id: "layers", label: "Each instruction is a cached layer", re: /\b(cache[ds]?|caching|layers?)\b/i, nudge: "Run the same build twice in a row with no changes. Why is the second run so much quicker?" },
      { id: "invalidate", label: "A changed input invalidates that layer and every one after it", re: /(invalidat|bust|re-?runs?|rebuil[dt]|re-?install|from scratch|all over again|every (time|build)|each time|after it|later (steps|layers)|following (steps|layers)|downstream|stale)/i, nudge: "If one copied file changes, which of the build's steps can Docker still reuse?" },
      { id: "deps-first", label: "Dependencies change far less often than code", re: /(requirements(\.txt)?\s+(first|before|separately|on its own|alone)|cop(y|ies|ying)\s+(only\s+)?(the\s+)?requirements|(dependencies|deps|requirements|packages)\s+(rarely|seldom|don'?t|do not|change less|stay)|less often|split (the )?copy)/i, nudge: "Which file in this project changes least often, and what would Docker reuse if it saw that file on its own?" },
    ],
  },
  {
    id: "docker-host-bind", kind: "break", topic: "Network binding", skills: ["docker"], weight: 5,
    match: present(DOCKERFILE, /0\.0\.0\.0/),
    prompt: (m) => `Look at ${m.vars.a} of ${m.vars.file}. Imagine a teammate changes the host to 127.0.0.1, as in the change shown. The image still builds and uvicorn still starts. What breaks when you open localhost:8000 on your laptop, and why?`,
    mutation: (m) => [`- ${m.anchor[0].text.trim()}`, `+ ${m.anchor[0].text.trim().replace(/0\.0\.0\.0/g, "127.0.0.1")}`],
    concepts: [
      { id: "loopback", label: "127.0.0.1 only accepts connections from inside the container", re: /(loopback|127\.0\.0\.1 (is|means|only)|only (listen|accept|reachable|visible|available|works)|inside (the |its own )?container|within (the )?container|its own localhost|container'?s (own )?localhost)/i, nudge: "When a process listens on 127.0.0.1, who is allowed to reach it?" },
      { id: "outside", label: "Your request arrives from outside, through the port mapping", re: /(from (the |my |your )?(host|laptop|browser|machine|outside)|outside (the )?container|port (mapping|forward)|-p 8000|published port|network (interface|namespace)|another interface|bridge network|external interface)/i, nudge: "When your browser calls localhost:8000, which machine's network does that request start on, and how does it get into the container?" },
      { id: "symptom", label: "The symptom: the connection is refused or reset", re: /(connection (refused|reset|error)|can'?t (connect|reach)|cannot (connect|reach)|couldn'?t (connect|reach)|unreachable|no response|empty reply|time[sd]? out|refuses?)/i, nudge: "What exactly would you see in the browser or in curl, even though the logs say the server started?" },
    ],
  },
  {
    id: "docker-root-user", kind: "break", topic: "Running as root", skills: ["docker", "security-basics"], weight: 3,
    reviewTerms: /\bUSER\b|root|unprivileged/i,
    match: absent(DOCKERFILE, /^FROM\b/i, /^USER\b/i, /^(CMD|ENTRYPOINT)\b/i),
    prompt: (m) => `Nothing in ${m.vars.file} sets a user, so the command on ${m.vars.a} runs as root inside the container. Suppose someone finds a bug in the upload endpoint that lets them run commands. What can they do that they couldn't as an ordinary user?`,
    concepts: [
      { id: "root", label: "The process has root rights in the container", re: /\b(root|superuser|uid 0|admin(istrator)? (rights|privileges)|privileged|privileges?)\b/i, nudge: "Which user does a container process run as when the Dockerfile never says?" },
      { id: "blast", label: "What an attacker could reach or change", re: /((write|modify|delete|overwrite|install|read|change|replace) (any|all|every|system|other|the (whole|entire))|whole (container|filesystem|file system|system)|escape|break out|mounted|volumes?|secrets?|env(ironment)? var|model weights|other files|anything)/i, nudge: "Name one file or resource in this container that an attacker could change with these rights but not without them." },
      { id: "least", label: "Least privilege limits the damage", re: /(least privilege|unprivileged|non-?root|normal user|limit(s|ed|ing)? (the )?(damage|blast)|blast radius|attack surface|contain(s|ed)? the damage|only the (permissions|access) it needs)/i, nudge: "If the process had only the permissions it needed, how much of that damage would still be possible?" },
    ],
  },
  {
    id: "docker-weights", kind: "tradeoff", topic: "Baking model weights into the image", skills: ["docker", "mlops"], weight: 3,
    reviewTerms: /weights|volume/i,
    match: present(DOCKERFILE, /^COPY\s+\S*models?\//i),
    prompt: (m) => `${m.vars.a[0].toUpperCase()}${m.vars.a.slice(1)} of ${m.vars.file} copies the model weights into the image (${m.vars.code}). Compared with mounting them as a volume or downloading them at start-up, what do you gain and what do you pay?`,
    concepts: [
      { id: "size", label: "A much bigger image to build, push and pull", re: /(gb\b|gigabytes?|huge|massive|big(ger)?|large(r)?|heav(y|ier)|size|push(ing)?|pull(ing)?|registry|bandwidth|storage|disk|slow(er)? (build|deploy|push|pull|download))/i, nudge: "What would `docker images` show for this one now, and who has to move it around whenever it changes?" },
      { id: "rebuild", label: "New weights mean a new image", re: /(rebuil[dt]|new image|every (time|update|new (model|version))|version(ing|s)?|fine-?tun|swap(ping)? (the )?(model|weights)|change (the )?(model|weights)|update (the )?(model|weights)|re-?deploy)/i, nudge: "What happens to the image when next week's improved model replaces these weights?" },
      { id: "gain", label: "What baking buys: self-contained, fast, reproducible starts", re: /(self-?contained|start(s|up)? (fast|quick|instantly|immediately)|no download|offline|reproducib|same (weights|model) everywhere|pinned|works anywhere|cold start|everything in one|one artefact|one artifact|no (extra )?(setup|mount))/i, nudge: "Why might someone choose to bake the weights in anyway? What does that save at start-up?" },
    ],
  },
  {
    id: "docker-base-image", kind: "tradeoff", topic: "Choosing a base image", skills: ["docker"], weight: 2,
    reviewTerms: /slim|image size|base image/i,
    match: present(DOCKERFILE, /^FROM\s+python:\d+(\.\d+)*\s*$/i),
    prompt: (m) => `${m.vars.a[0].toUpperCase()}${m.vars.a.slice(1)} starts from ${m.vars.code}, the full image. What would you gain and lose by switching to a slim variant for this API?`,
    concepts: [
      { id: "size", label: "Image size and pull time", re: /(size|mb\b|gb\b|smaller|bigger|large|heavy|bloat|faster (to )?(pull|push|download|deploy))/i, nudge: "How would you find out how big your image is right now, and what takes up the space?" },
      { id: "missing", label: "What slim leaves out", re: /(compil|gcc|build (tools|essentials?)|headers|apt|system (libraries|libs|packages)|debian|missing|wheels?|native (extensions|dependencies))/i, nudge: "Some Python packages need extra tools to install. Which ones, and where do those tools come from?" },
      { id: "surface", label: "Fewer packages, smaller attack surface", re: /(attack surface|vulnerab|cves?|security|fewer packages|less software|patch(es|ing)?)/i, nudge: "Every package in the image is something you may need to keep up to date. What does having fewer of them mean for that?" },
    ],
  },
  {
    id: "py-broad-except", kind: "break", topic: "Catching every exception", skills: ["python"], weight: 3,
    match: present(PY, /^except(\s+(Exception|BaseException))?\s*(as\s+\w+)?\s*:/),
    prompt: (m) => `${m.vars.a[0].toUpperCase()}${m.vars.a.slice(1)} of ${m.vars.file} is ${m.vars.code}. Someone calls the function with a path that doesn't exist. What error do they get, and what useful information has your code thrown away?`,
    concepts: [
      { id: "same", label: "Different failures end up looking the same", re: /(file ?not ?found|missing file|doesn'?t exist|does not exist|permission|every (error|exception)|all (errors|exceptions)|any (error|exception)|same (error|message)|whatever (went|goes) wrong)/i, nudge: "Name two very different things that could go wrong inside that try block. Would the caller be able to tell them apart?" },
      { id: "cause", label: "The original cause and traceback are lost", re: /(traceback|original (error|exception|cause|message)|from e\b|chain(ed|ing)?|stack trace|context|los(e|es|t)|hid(e|es|ing)|swallow|mask)/i, nudge: "When you raise a new exception inside except, what happens to the one you caught?" },
      { id: "narrow", label: "Catch only what you expect", re: /(specific|narrow|only (catch|handle)|unidentifiedimageerror|oserror|particular (error|exception)|separate(ly)?|re-?raise|raise .* from)/i, nudge: "Which exception does PIL actually raise for a file that isn't an image? What if only that one were handled here?" },
    ],
  },
  {
    id: "py-rgb-convert", kind: "break", topic: "Colour modes", skills: ["python", "pytorch"], weight: 3,
    match: present(PY, /\.convert\(\s*["']RGB["']\s*\)/),
    prompt: (m) => `Imagine ${m.vars.a} of ${m.vars.file} (${m.vars.code}) is deleted, as in the change shown. A user uploads a PNG with transparency, or a black-and-white scan. What goes wrong further down, and where?`,
    mutation: (m) => [`- ${m.anchor[0].text.trim()}`],
    concepts: [
      { id: "modes", label: "Images arrive in different colour modes", re: /(rgba|grayscale|greyscale|\bL mode|palette|\bP mode|cmyk|alpha|transparen|channels?|colou?r modes?\b|modes?\b)/i, nudge: "How many numbers describe one pixel of a PNG with see-through areas, and of a black-and-white scan?" },
      { id: "shape", label: "The tensor shape no longer matches what the model expects", re: /(shape|4 channels|four channels|1 channel|one channel|3 channels|three channels|dimension|size mismatch|model expects|stack|batch)/i, nudge: "How many numbers per pixel does your captioning model want for each image tensor?" },
      { id: "where", label: "Where it fails: pasting or stacking a batch", re: /(paste|canvas|torch\.stack|stack(ing)?|batch(ing)?|generate|inference|later|downstream|crash|error|fails?)/i, nudge: "Which line after this one is the first to care how many numbers each pixel has?" },
    ],
  },
  {
    id: "py-letterbox", kind: "tradeoff", topic: "Padding instead of stretching", skills: ["python"], weight: 2,
    match: present(PY, /\.paste\(/),
    prompt: (m) => `${m.vars.a[0].toUpperCase()}${m.vars.a.slice(1)} pastes the resized image onto a square canvas instead of stretching it to 384 by 384. What does padding protect, and what does it cost?`,
    concepts: [
      { id: "aspect", label: "Keeps the aspect ratio, so shapes aren't distorted", re: /(aspect ratio|stretch|distort|squash|squish|proportion|warp)/i, nudge: "What would a tall, thin photo look like if it were forced to be as wide as it is tall?" },
      { id: "waste", label: "The padding is empty pixels the model still sees", re: /(black (bars|border|borders|padding|edges)|empty|wasted|border|bars|padding|letterbox|blank)/i, nudge: "What fills the canvas where the image doesn't reach, and does the model know it's meaningless?" },
      { id: "fixed", label: "The model needs one fixed input size", re: /(model (needs|expects|wants)|square|fixed (input )?size|same size|input size|batch|stack)/i, nudge: "Why must every image end up as exactly 384 by 384 before inference?" },
    ],
  },
  {
    id: "torch-no-grad", kind: "break", topic: "Autograd at inference", skills: ["pytorch", "deep-learning"], weight: 3,
    match: present(PY, /torch\.(no_grad|inference_mode)\(\)/),
    prompt: (m) => `Imagine ${m.vars.a} of ${m.vars.file} (${m.vars.code}) is removed, as in the change shown, and the captioning loop runs on 2,000 images. The captions come out the same. What changed, and why could the run still fail?`,
    mutation: (m) => [`- ${m.anchor[0].text.trim()}`, `+ ${m.anchor[0].text.replace(/torch\.(no_grad|inference_mode)\(\)/, "contextlib.nullcontext()").trim()}`],
    concepts: [
      { id: "graph", label: "Autograd records a graph for every operation", re: /(grad(ient)?s?\b|autograd|computation(al)? graph|graph|backward|track(s|ing)?|requires_grad)/i, nudge: "What does PyTorch keep a record of during a forward pass, and what is that record for?" },
      { id: "memory", label: "That record holds memory for intermediate tensors", re: /(memory|ram\b|vram\b|oom\b|out of memory|activations|intermediate|store[sd]?\b|keeps? (the )?tensors)/i, nudge: "Where does that record live, and does it grow with the batch?" },
      { id: "speed", label: "Outputs are identical; it only costs time and memory", re: /(slower|speed|faster|overhead|same (output|result|caption|prediction)s?|doesn'?t change (the )?(output|result|captions?)|no effect on (the )?(output|result))/i, nudge: "Since the captions are the same, what is the only thing this line was ever changing?" },
    ],
  },
  {
    id: "torch-eval-once", kind: "order", topic: "Eval mode", skills: ["pytorch", "deep-learning"], weight: 3,
    match: ordered(PY, /\.eval\(\)/, /torch\.(no_grad|inference_mode)\(\)|for\s+\w+\s+in\b/),
    prompt: (m) => `${m.vars.codeA} is called once on ${m.vars.a}, before ${m.vars.codeB} on ${m.vars.b}. Why is calling it once, before the loop, enough? What would differ if it came after the first batch instead?`,
    concepts: [
      { id: "flag", label: "eval() sets a mode on the model that persists", re: /(modes?\b|flag\b|switch(es|ed)?\b|state\b|stays|persist|until\b|sets? (it|the model)|training (mode|=)|\.train\(\))/i, nudge: "Does model.eval() change the weights, or something else about the model? How long does that change last?" },
      { id: "layers", label: "It changes how dropout and batch norm behave", re: /(dropout|batch ?norm|batchnorm|running (mean|stats|statistics)|layer ?norm)/i, nudge: "Which kinds of layers behave differently during training than during inference?" },
      { id: "effect", label: "Before the switch, outputs are random or inconsistent", re: /(random(ly|ness)?|inconsistent|noisy|non-?deterministic|different (captions?|results?|outputs?)|vary|varies|first batch)/i, nudge: "If the opening batch ran with training behaviour still on, would captioning one photo twice give matching captions?" },
    ],
  },
  {
    id: "torch-batch-size", kind: "tradeoff", topic: "Batch size", skills: ["pytorch", "deep-learning"], weight: 2,
    match: present(PY, /^BATCH(_SIZE)?\s*=\s*\d+/i),
    prompt: (m) => `${m.vars.a[0].toUpperCase()}${m.vars.a.slice(1)} of ${m.vars.file} sets ${m.vars.code}. What would happen to speed and memory with 64 instead, and with 1? How would you pick the number for a laptop CPU?`,
    concepts: [
      { id: "memory", label: "Bigger batches need more memory at once", re: /(memory|ram\b|vram\b|oom\b|out of memory|fits?\b|crash|swap\b)/i, nudge: "What has to be held at the same moment when a batch is processed, and where?" },
      { id: "throughput", label: "Bigger batches use the hardware better, up to a point", re: /(throughput|faster|speed|parallel|vectori[sz]|efficien|overhead|per image|utili[sz])/i, nudge: "Why might one batch of 8 finish sooner than 8 batches of 1?" },
      { id: "measure", label: "Pick it by measuring on the target machine", re: /(measur|benchmark|profil|tried|test(ed|ing)? (a few|different)|time (it|each)|watch (the )?memory|largest that fits|start small)/i, nudge: "How could you find the best number for your laptop without guessing?" },
    ],
  },
  {
    id: "sql-index", kind: "tradeoff", topic: "Adding an index", skills: ["sql", "databases", "postgresql"], weight: 3,
    match: present(SQL, /^CREATE\s+(UNIQUE\s+)?INDEX/i),
    prompt: (m) => `${m.vars.a[0].toUpperCase()}${m.vars.a.slice(1)} of ${m.vars.file} adds an index. Which query gets faster because of it, and what does the table pay every time a caption request is saved?`,
    concepts: [
      { id: "read", label: "Reads can skip scanning the whole table", re: /(faster|speed(s)? up|lookup|full (table )?scan|seq(uential)? scan|seek|range|without (reading|scanning)|index scan|slowest|report)/i, nudge: "Without the index, how many rows does Postgres have to look at to find this week's ten worst requests?" },
      { id: "write", label: "Every insert also updates the index", re: /(slower (inserts?|writes?)|inserts?|writes?|update[sd]? (the )?index|maintain|overhead|storage|disk|space)/i, nudge: "When a new caption request is saved, what else has to change besides the table itself?" },
      { id: "fit", label: "It matches the query's filter and sort", re: /(created_at|latency_ms|where|order by|filter|sort|matches (the )?query|column order|leading column)/i, nudge: "Which parts of the ten-worst-requests query does this index line up with?" },
    ],
  },
  {
    id: "sql-index-order", kind: "order", topic: "Column order in an index", skills: ["sql", "databases", "postgresql"], weight: 3,
    match: present(SQL, /^CREATE\s+(UNIQUE\s+)?INDEX.*\(\s*\w+\s*,\s*\w+/i),
    prompt: (m) => `The index on ${m.vars.a} lists its columns in a particular order: ${m.vars.code}. Why that order? What would change if the two columns were swapped?`,
    concepts: [
      { id: "leading", label: "The leading column decides what the index can narrow down", re: /(leading|first column|left-?most|prefix|sorted (by|on) .*first|ordered by .*first)/i, nudge: "In a phone book ordered by surname and then given name, which lookups are quick and which aren't?" },
      { id: "range", label: "The query filters on a time range first", re: /(range|this week|date_trunc|created_at\s*>=|filter(s|ing)? (on|by) (the )?(date|time|created)|where)/i, nudge: "Which column does the weekly query narrow down, and in what way?" },
      { id: "swap", label: "Swapped, the index can't narrow the week first", re: /(swap(ped)?|wouldn'?t (help|be used)|can'?t (use|be used)|scan (more|everything|all)|less useful|useless|full scan|ignored)/i, nudge: "If latency came first, could Postgres jump straight to the rows from the last seven days?" },
    ],
  },
  {
    id: "sql-check", kind: "break", topic: "Constraints", skills: ["sql", "databases"], weight: 3,
    match: present(SQL, /CHECK\s*\(/i),
    prompt: (m) => `Imagine the constraint on ${m.vars.a} of ${m.vars.file} is removed, as in the change shown. A bug in the API starts saving latency as -1. What breaks, and when would anyone notice?`,
    mutation: (m) => [`- ${m.anchor[0].text.trim()}`, `+ ${m.anchor[0].text.replace(/\s*CHECK\s*\([^)]*\)/i, "").trim()}`],
    concepts: [
      { id: "accepts", label: "The database accepts impossible values", re: /(accept|allow|store[sd]?|saved?|insert(ed|s)?) .*(negative|-1|invalid|impossible|bad|wrong)|(negative|-1|invalid|impossible|bad) (values?|data|rows?|latenc)/i, nudge: "Without the constraint, what does Postgres say when it receives -1?" },
      { id: "downstream", label: "Reports and averages silently go wrong", re: /(report|average|mean\b|slowest|query|stat(s|istics)|dashboard|silently|wrong (numbers|results|answers?)|skew|misleading)/i, nudge: "Once some rows hold -1, which number in this PR's output stops being trustworthy?" },
      { id: "late", label: "Nobody notices until much later", re: /(later|weeks?|months?|nobody|no one|no error|until|hard to (find|debug|trace)|at the source|fail(s)? (early|fast|loudly))/i, nudge: "With the constraint, when exactly does the bug get caught? And without it?" },
    ],
  },
];

// ---------- generic probes (any language) ----------

export const GENERIC_PROBES: Probe[] = [
  {
    id: "generic-branch", kind: "break", topic: "Handling a special case", skills: [], weight: 1,
    match: (lines) => {
      const hit = codeLines(lines).find((l) => /^(if|elif|else\s*if|except|catch|\}\s*catch|try)\b|\bif\s*\(/.test(code(l)));
      return hit ? { anchor: [hit], vars: { a: at(hit), code: tick(code(hit)), file: hit.file } } : null;
    },
    prompt: (m) => `${m.vars.a[0].toUpperCase()}${m.vars.a.slice(1)} of ${m.vars.file} handles a special case: ${m.vars.code}. What would break if this branch were deleted, and how would you find out?`,
    mutation: (m) => [`- ${m.anchor[0].text.trim()}`],
    concepts: [
      { id: "case", label: "Names the input or situation it handles", re: /(empty|invalid|missing|none|null|undefined|corrupt|wrong (type|format)|edge case|bad input|not found|zero|negative|too (big|large|long)|duplicate)/i, nudge: "Describe one concrete input that reaches this branch." },
      { id: "breaks", label: "Says what goes wrong without it", re: /(crash|traceback|stack trace|500|wrong (result|answer|output|value)|silently|garbage|hang|propagat|downstream|corrupt)/i, nudge: "Follow that input past the deleted branch. What is the first thing that goes wrong?" },
      { id: "notice", label: "Says how you would notice", re: /(tests?\b|testing|logs?\b|logging|alerts?\b|monitor|error message|users? (see|sees|get|gets)|assert|caught|notice|debug|ci\b)/i, nudge: "Who or what would tell you first that something is off?" },
    ],
  },
  {
    id: "generic-literal", kind: "tradeoff", topic: "Choosing a value", skills: [], weight: 1,
    match: (lines) => {
      const hit = codeLines(lines).find((l) => /(=|:|\()\s*\d{2,}\b/.test(code(l)) && !/^(@@|import|from)\b/.test(code(l)));
      const value = hit ? code(hit).match(/(?:=|:|\()\s*(\d{2,})\b/)?.[1] : undefined;
      return hit && value ? { anchor: [hit], vars: { a: at(hit), code: tick(code(hit)), file: hit.file, value } } : null;
    },
    prompt: (m) => `${m.vars.a[0].toUpperCase()}${m.vars.a.slice(1)} of ${m.vars.file} uses the value ${m.vars.value} (${m.vars.code}). Why that number? What changes if it were ten times bigger, or ten times smaller?`,
    concepts: [
      { id: "controls", label: "What the value controls", re: /(memory|speed|time|latency|throughput|size|resolution|quality|accuracy|cost|limit|timeout|port|capacity|detail)/i, nudge: "In one sentence: what does this number control?" },
      { id: "both", label: "Both directions of the trade-off", re: /((bigger|larger|higher|more|increase)[\s\S]*(smaller|lower|less|fewer|decrease))|((smaller|lower|less|fewer|decrease)[\s\S]*(bigger|larger|higher|more|increase))/i, nudge: "You described one direction. What gets better, and what gets worse, in the other?" },
      { id: "chosen", label: "How it was chosen", re: /(measured|benchmark|tested|tried|default|docs?|spec|requirement|acceptance|issue|because (the|it|we)|fits|enough|convention|standard)/i, nudge: "Where did this number come from, and how would you defend it to your reviewer?" },
    ],
  },
  {
    id: "generic-order", kind: "order", topic: "Order of operations", skills: [], weight: 1,
    // A real data dependency: line b reads a name that line a assigns, within the next three code lines.
    match: (lines) => {
      const ls = codeLines(lines).filter((l) => !/^(import|from|#include|using|package)\b/.test(code(l)));
      for (let k = 0; k < ls.length; k++) {
        const name = code(ls[k]).match(/^(?:const|let|var|val)?\s*([A-Za-z_]\w*)\s*(?::=|=)(?!=)/)?.[1];
        if (!name || name.length < 2) continue;
        const uses = new RegExp(`\\b${name}\\b`);
        const b = ls.slice(k + 1, k + 4).find((l) => l.file === ls[k].file && uses.test(code(l)));
        if (b) return { anchor: [ls[k], b], vars: { a: at(ls[k]), b: at(b), codeA: tick(code(ls[k])), codeB: tick(code(b)), file: b.file } };
      }
      return null;
    },
    prompt: (m) => `In ${m.vars.file}, ${m.vars.codeA} on ${m.vars.a} runs before ${m.vars.codeB} on ${m.vars.b}. Does the order matter? What would happen if you swapped them?`,
    concepts: [
      { id: "needs", label: "Says what the second line needs from the first", re: /(needs?|depends|requires|uses|relies|expects|already|has to (exist|be))/i, nudge: "Does the second line use anything the first one creates or changes?" },
      { id: "swapped", label: "Says what goes wrong if swapped", re: /(undefined|not (yet )?(defined|set|exist|ready|loaded)|error|fail|crash|stale|wrong|empty|none|null|race)/i, nudge: "Walk through the swapped version one line at a time. What is true when the new first line runs?" },
      { id: "verdict", label: "Gives a clear verdict on whether order matters", re: /(doesn'?t matter|order matters|independent|same result|no difference|must|has to|only works|either order)/i, nudge: "So, in one sentence: does the order matter here or not?" },
    ],
  },
];

const ALL = [...PROBES, ...GENERIC_PROBES];
// Concepts match from a word boundary, so "parameter" never counts as "ram" and "important" never as "port".
for (const p of ALL) for (const c of p.concepts) c.re = new RegExp(`\\b(?:${c.re.source})`, c.re.flags);
const BY_ID = new Map(ALL.map((p) => [p.id, p]));
export const probeById = (id: string): Probe | undefined => BY_ID.get(id);

// ---------- question selection ----------

export interface Candidate { probe: Probe; m: ProbeMatch; score: number; fromReview: boolean }

/** Every probe that fires on the diff, scored: specific weight + 1 for the skill + 2 when the Tech Lead raised it. */
export function candidatesFor(lines: DiffLine[], opts: { skillId?: string; reviewText?: string } = {}): Candidate[] {
  const out: Candidate[] = [];
  for (const probe of ALL) {
    let m: ProbeMatch | null = null;
    try { m = probe.match(lines); } catch { m = null; }
    if (!m) continue;
    const fromReview = !!(opts.reviewText && probe.reviewTerms?.test(opts.reviewText));
    const skill = opts.skillId && probe.skills.includes(opts.skillId) ? 1 : 0;
    out.push({ probe, m, score: probe.weight + skill + (fromReview ? 2 : 0), fromReview });
  }
  return out;
}

/**
 * Picks up to three questions: the best probe for each kind first (so the viva mixes "what would break", "why this
 * order" and "trade-off"), then the best remaining; never two on the same line; ordered top to bottom of the diff.
 */
export function pickQuestions(cands: Candidate[], n = 3): Candidate[] {
  const sorted = [...cands].sort((a, b) => b.score - a.score || a.m.anchor[0].i - b.m.anchor[0].i || a.probe.id.localeCompare(b.probe.id));
  const chosen: Candidate[] = [];
  // Two questions may share a line only when they ask different kinds of thing about it.
  const used = new Map<number, Set<VivaKind>>();
  const free = (c: Candidate) => c.m.anchor.every((l) => !used.get(l.i)?.has(c.probe.kind));
  const take = (c: Candidate) => {
    chosen.push(c);
    for (const l of c.m.anchor) used.set(l.i, new Set([...(used.get(l.i) ?? []), c.probe.kind]));
  };
  // First the best specific probe of each kind, then the best of whatever is left (generic probes fill gaps only).
  for (const kind of ["break", "order", "tradeoff"] as VivaKind[]) {
    const best = sorted.find((c) => c.probe.kind === kind && c.probe.weight >= 2 && !chosen.includes(c) && free(c));
    if (best && chosen.length < n) take(best);
  }
  for (const c of sorted) if (chosen.length < n && !chosen.includes(c) && free(c)) take(c);
  return chosen.sort((a, b) => a.m.anchor[0].i - b.m.anchor[0].i);
}

/** The public question for a chosen candidate (no rubric). */
export function toQuestion(c: Candidate, index: number): VivaQuestion {
  return {
    id: `q${index + 1}`,
    kind: c.probe.kind,
    topic: c.probe.topic,
    prompt: c.probe.prompt(c.m),
    anchor: c.m.anchor.map((l) => l.i),
    file: c.m.anchor[0].file,
    ...(c.probe.mutation ? { mutation: c.probe.mutation(c.m).map((s) => s.slice(0, 200)) } : {}),
    fromReview: c.fromReview,
    maxScore: POINTS_PER_QUESTION,
  };
}
