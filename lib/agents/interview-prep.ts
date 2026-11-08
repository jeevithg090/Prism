import "server-only";
// P5 · Gap-tailored interview question bank + prep roadmap.
// Pure and deterministic: a static question bank keyed by skill id, no LLM.
// Reads the user's Bridge Map and proof ladder, picks the top 3 gap skills,
// and emits started → progress → done agent events.
import { loadGraph } from "@/lib/graph/build";
import { getProofLadder } from "@/lib/agents/ladder";
import { emit, newRunId } from "@/lib/agents/events";
import { skillName } from "@/lib/schemas/community";
import type { AgentName, BridgeMap, BridgeNode, SkillId } from "@/lib/types";

export type InterviewQuestionType = "behavioural" | "technical" | "system-design" | "coding";
export type InterviewDifficulty = 1 | 2 | 3;

export interface InterviewQuestion {
  id: string;
  skillId: SkillId;
  question: string;
  type: InterviewQuestionType;
  difficulty: InterviewDifficulty;
  tip: string;
}

export interface InterviewPrepSlice {
  skillId: SkillId;
  questions: InterviewQuestion[];
  focus: string;
}

const MAX_GAPS = 3;
const QUESTIONS_PER_SKILL = 4; // within the 3-5 contract window

const q = (skillId: SkillId, n: number, question: string, type: InterviewQuestionType, difficulty: InterviewDifficulty, tip: string): InterviewQuestion => ({
  id: `prep-${skillId}-q${n}`,
  skillId,
  question,
  type,
  difficulty,
  tip,
});

// ---------- Built-in question bank, keyed by skill id ----------
// Unknown skills fall back to `DEFAULT_BEHAVIOURAL` below.
const QUESTION_BANK: Record<SkillId, InterviewQuestion[]> = {
  python: [
    q("python", 1, "Write a function that reads a CSV file and returns each row as a dictionary. How would you handle a missing file?", "coding", 2, "Use the csv module and wrap the open in try/except, returning a clear error rather than crashing."),
    q("python", 2, "What's the difference between a list and a tuple in Python, and when would you use each?", "technical", 2, "Lists are mutable; tuples are immutable and hashable, so tuples can be dict keys or set members."),
    q("python", 3, "Explain Python's Global Interpreter Lock (GIL) and its effect on threading versus multiprocessing.", "technical", 3, "The GIL lets only one thread execute Python bytecode at a time; use multiprocessing for CPU-bound work."),
    q("python", 4, "Implement a function that finds the longest substring without repeating characters. Walk me through your approach.", "coding", 3, "Use a sliding window with a set or hash map tracking the last seen index of each character."),
  ],
  javascript: [
    q("javascript", 1, "What's the difference between `==` and `===` in JavaScript, and which should you use?", "technical", 1, "Always use `===`: `==` does type coercion, which leads to surprising results."),
    q("javascript", 2, "Explain closures with a concrete example. When are they useful?", "technical", 2, "A closure lets a function remember variables from its outer scope; useful for data privacy and function factories."),
    q("javascript", 3, "How does the event loop work, and what's the difference between microtasks and macrotasks?", "technical", 3, "Promises queue microtasks (run after the current task); setTimeout queues macrotasks (run after the render/paint cycle)."),
    q("javascript", 4, "Write a function that debounces a callback so it only fires after the user stops calling it.", "coding", 3, "Use `setTimeout` and `clearTimeout` to reset the timer on every call."),
  ],
  typescript: [
    q("typescript", 1, "What does `any` do, and why should you avoid it?", "technical", 1, "`any` opts out of type checking; prefer `unknown` or a precise type so the compiler can catch mistakes."),
    q("typescript", 2, "Explain the difference between an `interface` and a `type` alias.", "technical", 2, "Interfaces are best for object shapes and support declaration merging; type aliases handle unions and primitives."),
    q("typescript", 3, "What are generics, and where would you use one in a React component?", "technical", 2, "Generics let a component or function work over a range of types while keeping type safety, e.g. a generic list component."),
    q("typescript", 4, "How does TypeScript's structural typing differ from nominal typing?", "technical", 2, "TypeScript checks the shape of a value, not its declared name, so two objects with the same shape are compatible."),
  ],
  java: [
    q("java", 1, "What's the difference between an abstract class and an interface in Java?", "technical", 2, "Abstract classes can hold state and constructors; interfaces define contracts (and, since Java 8, default methods)."),
    q("java", 2, "Explain the JVM, JRE, and JDK and how they relate.", "technical", 1, "JDK is the dev kit, JRE is the runtime environment, JVM is the virtual machine that runs bytecode."),
    q("java", 3, "How does garbage collection work in Java, and when should you think about it?", "technical", 2, "The JVM reclaims unreachable objects automatically; tune it when you see long GC pauses or OutOfMemoryErrors."),
    q("java", 4, "Write a small method that counts word frequencies in a string using a Map.", "coding", 2, "Split the string, then increment `map.merge(word, 1, Integer::sum)` or use `computeIfAbsent`."),
  ],
  sql: [
    q("sql", 1, "Write a query that finds the second-highest salary from an employees table.", "coding", 2, "Use `ORDER BY salary DESC LIMIT 1 OFFSET 1`, or a subquery with `DENSE_RANK()` for ties."),
    q("sql", 2, "What's the difference between `INNER JOIN`, `LEFT JOIN`, and `FULL OUTER JOIN`?", "technical", 2, "INNER keeps matching rows only; LEFT keeps all left rows; FULL keeps all rows from both sides."),
    q("sql", 3, "When would you use a CTE versus a subquery?", "technical", 2, "CTEs are named and reusable, making complex queries easier to read and debug than nested subqueries."),
    q("sql", 4, "How does an index speed up a query, and what's the trade-off?", "technical", 3, "Indexes speed up lookups but slow down writes and use extra storage; index columns you filter or join on."),
  ],
  postgresql: [
    q("postgresql", 1, "What's the difference between `TEXT`, `VARCHAR`, and `CHAR` in PostgreSQL?", "technical", 1, "Use `TEXT` unless you need a length constraint; PostgreSQL doesn't treat them differently at runtime."),
    q("postgresql", 2, "Explain `VACUUM` and why PostgreSQL needs it.", "technical", 3, "Dead tuples from updates/deletes are marked but not removed; VACUUM reclaims that space and updates statistics."),
    q("postgresql", 3, "What are PostgreSQL's JSONB columns good for?", "technical", 2, "JSONB stores structured, queryable semi-structured data with GIN indexes for fast key lookups."),
    q("postgresql", 4, "Write a query that returns the top 3 most expensive orders per customer.", "coding", 3, "Use `ROW_NUMBER()` partitioned by customer ordered by price desc, then filter where row number <= 3."),
  ],
  react: [
    q("react", 1, "What's the difference between state and props in React?", "technical", 1, "Props are passed in by a parent; state is owned and updated by the component itself."),
    q("react", 2, "Explain the `useEffect` dependency array and what happens when you omit it.", "technical", 2, "Without a dependency array the effect runs after every render; with an empty array it runs once after mount."),
    q("react", 3, "How do you lift state up, and when is it necessary?", "technical", 2, "Move shared state to the closest common ancestor and pass it down as props so siblings stay in sync."),
    q("react", 4, "Write a small component that toggles a like button and persists the choice in localStorage.", "coding", 2, "Use `useState` seeded from `localStorage.getItem`, plus a `useEffect` that writes back on change."),
  ],
  nodejs: [
    q("nodejs", 1, "What is the Node.js event loop, and why is Node non-blocking?", "technical", 2, "Node runs JavaScript on a single thread and offloads I/O to libuv, so one slow request doesn't block others."),
    q("nodejs", 2, "How do you handle uncaught exceptions in a production Node app?", "technical", 3, "Use `process.on('uncaughtException')` as a last-resort logger, but prefer structured error handling and a process manager that restarts on crash."),
    q("nodejs", 3, "What's the difference between `fs.readFile` and `fs.createReadStream`?", "technical", 2, "`readFile` loads the whole file into memory; `createReadStream` streams it in chunks for large files."),
    q("nodejs", 4, "Write a tiny HTTP server with Node's built-in `http` module that returns JSON.", "coding", 1, "Use `http.createServer`, set `Content-Type: application/json`, and end with `JSON.stringify`.{}"),
  ],
  "rest-apis": [
    q("rest-apis", 1, "What does it mean for an API to be RESTful?", "technical", 1, "It uses HTTP methods (GET/POST/PUT/DELETE), resource URLs, and stateless responses with proper status codes."),
    q("rest-apis", 2, "When would you use `201 Created` versus `200 OK`?", "technical", 1, "`201` for a successful resource creation; `200` for a successful read or update."),
    q("rest-apis", 3, "How do you version a REST API?", "technical", 2, "Common approaches are the URL path (`/v1/...`), a custom header, or content negotiation (`Accept` header)."),
    q("rest-apis", 4, "Design a pagination scheme for a list endpoint.", "system-design", 2, "Support `limit` and `offset` or `cursor`-based pagination, and return `next`/`prev` links plus a total count."),
  ],
  docker: [
    q("docker", 1, "What's the difference between a Docker image and a container?", "technical", 1, "An image is the read-only template; a container is a running instance of that image."),
    q("docker", 2, "What are Docker layers, and why do they matter for build speed?", "technical", 2, "Each instruction creates a layer; Docker caches layers, so putting slow-to-change steps first speeds up rebuilds."),
    q("docker", 3, "How do you keep images small?", "technical", 2, "Use multi-stage builds so only build artifacts ship, and prefer slim or distroless base images."),
    q("docker", 4, "Write a Dockerfile for a Python app and explain each instruction.", "coding", 2, "FROM python:slim, WORKDIR, COPY requirements first (cache), RUN pip install, COPY code, CMD to start the app."),
  ],
  aws: [
    q("aws", 1, "What's the difference between EC2 and Lambda?", "technical", 1, "EC2 gives you a virtual server you manage; Lambda runs code in response to events with no servers to manage."),
    q("aws", 2, "What is an S3 bucket used for?", "technical", 1, "Object storage for files, backups, static assets, and data lakes, accessed via HTTP/API."),
    q("aws", 3, "How does IAM keep an AWS account secure?", "technical", 2, "IAM controls who (users/roles) can do what (policies) to which resources, following least privilege."),
    q("aws", 4, "Design a simple three-tier web architecture on AWS.", "system-design", 3, "Route53 → Application Load Balancer → EC2/Auto Scaling → RDS, with S3 for assets and CloudFront in front."),
  ],
  linux: [
    q("linux", 1, "How do you check which process is using a port on Linux?", "technical", 1, "Use `ss -tlnp` or `lsof -i :<port>` to see the listening process and its PID."),
    q("linux", 2, "What's the difference between a hard link and a soft (symbolic) link?", "technical", 1, "A hard link points to the same inode; a soft link is a path to another file and breaks if the target moves."),
    q("linux", 3, "How do you view and follow a growing log file?", "technical", 1, "Use `tail -f /path/to/log` to stream new lines as they're written."),
    q("linux", 4, "Write a one-liner that counts how many lines in a file contain the word 'error'.", "coding", 1, "`grep -c 'error' file.log` counts matching lines; `grep -i` makes it case-insensitive."),
  ],
  git: [
    q("git", 1, "What's the difference between `git merge` and `git rebase`?", "technical", 2, "Merge keeps history and adds a merge commit; rebase replays your commits on top for a linear history."),
    q("git", 2, "How do you undo a commit that hasn't been pushed yet?", "technical", 1, "Use `git reset --soft HEAD~1` to keep changes staged, or `git reset --mixed` to unstage them."),
    q("git", 3, "What's the purpose of a `.gitignore` file?", "technical", 1, "It tells Git which files or folders to ignore, such as node_modules, build output, and secrets."),
    q("git", 4, "Explain how you'd resolve a merge conflict in a pull request.", "coding", 2, "Pull the latest main, edit the conflicted files to keep what you need, `git add`, then commit the merge."),
  ],
  kubernetes: [
    q("kubernetes", 1, "What's the difference between a Pod and a Deployment?", "technical", 1, "A Pod is one or more containers scheduled together; a Deployment manages ReplicaSets and rolling updates of Pods."),
    q("kubernetes", 2, "How does a Service expose Pods?", "technical", 2, "A Service gives a stable IP and DNS name and load-balances traffic to a set of Pods selected by labels."),
    q("kubernetes", 3, "What are resource requests and limits, and why set them?", "technical", 2, "Requests guarantee CPU/memory; limits cap them, preventing one Pod from starving its node."),
    q("kubernetes", 4, "How would you roll out a new version of an app with zero downtime?", "system-design", 3, "Use a Deployment with a rolling update strategy: new Pods start before old ones terminate, with readiness probes."),
  ],
  "ci-cd": [
    q("ci-cd", 1, "What does CI/CD stand for, and what's the difference between them?", "technical", 1, "CI is continuous integration (build and test on every push); CD is continuous delivery/deployment (release automatically)."),
    q("ci-cd", 2, "What belongs in a CI pipeline?", "technical", 1, "Linting, unit tests, type checking, security scans, and building artifacts on every pull request."),
    q("ci-cd", 3, "How do you keep secrets out of your repository?", "technical", 2, "Store secrets in the CI provider's encrypted variables or a secret manager, never in code or `.env` files committed to Git."),
    q("ci-cd", 4, "Design a pipeline that deploys to staging on every main merge.", "system-design", 3, "Lint → test → build → push image to a registry → deploy to staging → smoke test, with a manual gate for production."),
  ],
  "data-structures": [
    q("data-structures", 1, "When would you use a hash map versus an array?", "coding", 1, "Use an array for ordered, indexed data; a hash map for fast lookups, insertions, and deletions by key."),
    q("data-structures", 2, "Explain a linked list and how it differs from an array.", "coding", 2, "Linked lists chain nodes via pointers; they're cheap to insert at the head but slow to look up by index."),
    q("data-structures", 3, "What's a stack, and where is it used?", "coding", 1, "A stack is last-in-first-out; used for undo, call stacks, and parsing nested structures."),
    q("data-structures", 4, "Implement a queue using two stacks.", "coding", 3, "Push to an input stack; to dequeue, pop from an output stack, refilling it from the input stack when empty."),
  ],
  algorithms: [
    q("algorithms", 1, "What is Big O notation, and why do interviewers care?", "coding", 1, "It describes how runtime grows with input size; it lets you compare algorithms and spot bottlenecks."),
    q("algorithms", 2, "Explain binary search and when it applies.", "coding", 2, "Binary search halves a sorted range each step (O(log n)); it only works on sorted data."),
    q("algorithms", 3, "What's the difference between breadth-first and depth-first search?", "coding", 2, "BFS explores level by level (queue); DFS goes deep first (stack/recursion)."),
    q("algorithms", 4, "Write a function that merges two sorted arrays into one sorted array.", "coding", 2, "Use two pointers, comparing the current head of each array and appending the smaller value."),
  ],
  "system-design": [
    q("system-design", 1, "What is load balancing, and why use it?", "system-design", 1, "It spreads traffic across multiple servers so no single server becomes a bottleneck or single point of failure."),
    q("system-design", 2, "What's the difference between horizontal and vertical scaling?", "system-design", 1, "Vertical scaling adds power to one server; horizontal adds more servers behind a load balancer."),
    q("system-design", 3, "When would you add a cache to a system?", "system-design", 2, "Cache read-heavy data that changes infrequently, and invalidate it when the source changes."),
    q("system-design", 4, "Design a URL shortener like bit.ly.", "system-design", 3, "Generate a short key, store the mapping in a database + Redis cache, and redirect on the short key with analytics."),
  ],
  testing: [
    q("testing", 1, "What's the difference between unit, integration, and end-to-end tests?", "technical", 1, "Unit tests check one function; integration tests check several units together; e2e tests check the whole flow from the user's perspective."),
    q("testing", 2, "What is a mock, and when should you use one?", "technical", 2, "A mock replaces a dependency (e.g. a database or API) so your test is fast, deterministic, and isolated."),
    q("testing", 3, "What makes a good test case?", "technical", 2, "It tests one thing, has a clear expected result, and covers both the happy path and common failure modes."),
    q("testing", 4, "Write a unit test for a function that calculates a discount.", "coding", 2, "Test normal prices, zero price, negative input, and edge-case discount percentages; assert exact outputs."),
  ],
  "machine-learning": [
    q("machine-learning", 1, "What's the difference between supervised and unsupervised learning?", "technical", 1, "Supervised learns from labeled examples; unsupervised finds patterns in unlabeled data."),
    q("machine-learning", 2, "What is overfitting, and how do you reduce it?", "technical", 2, "Overfitting is memorizing training data instead of generalizing; reduce it with more data, regularization, or a simpler model."),
    q("machine-learning", 3, "What are precision and recall, and when does each matter?", "technical", 2, "Precision is 'of predicted positives, how many are right'; recall is 'of actual positives, how many did we find'. Use recall for serious misses (e.g. disease)."),
    q("machine-learning", 4, "How would you evaluate a classification model beyond accuracy?", "technical", 2, "Use precision, recall, F1, and a confusion matrix, especially when classes are imbalanced."),
  ],
  pytorch: [
    q("pytorch", 1, "What's a PyTorch tensor, and how is it different from a NumPy array?", "technical", 1, "A tensor is a multi-dimensional array that can live on a GPU and track gradients for autograd."),
    q("pytorch", 2, "What does `loss.backward()` do?", "technical", 2, "It runs backpropagation, computing gradients of the loss with respect to every parameter that requires grad."),
    q("pytorch", 3, "What's the difference between `train()` and `eval()` mode?", "technical", 2, "`train()` enables dropout and batch-norm updates; `eval()` disables them for consistent inference."),
    q("pytorch", 4, "Write a tiny training loop: forward pass, loss, backward, optimizer step.", "coding", 3, "Zero gradients, `output = model(x)`, `loss = criterion(output, y)`, `loss.backward()`, `optimizer.step()`."),
  ],
  pandas: [
    q("pandas", 1, "What's the difference between a Pandas Series and a DataFrame?", "technical", 1, "A Series is one column; a DataFrame is a table of columns with aligned indexes."),
    q("pandas", 2, "How do you handle missing values in a DataFrame?", "technical", 2, "Use `dropna()` to remove rows or `fillna()` to impute them, depending on how much data you'd lose."),
    q("pandas", 3, "What does `groupby` do?", "technical", 2, "It splits a DataFrame by key, applies a function (sum, mean, count), and combines the results."),
    q("pandas", 4, "Write code that reads a CSV and filters rows where `age > 30`.", "coding", 1, "`df = pd.read_csv('file.csv'); df[df['age'] > 30]`."),
  ],
  "scikit-learn": [
    q("scikit-learn", 1, "What's the standard train/test split workflow in scikit-learn?", "technical", 1, "Use `train_test_split`, fit the model on training data, and score it on held-out test data."),
    q("scikit-learn", 2, "Why should you scale features before training many models?", "technical", 2, "Distance-based models (KNN, SVM, logistic regression) are biased by feature scale; use StandardScaler or MinMaxScaler."),
    q("scikit-learn", 3, "What's cross-validation, and why use it?", "technical", 2, "It trains and validates on multiple folds to estimate how well the model generalizes to unseen data."),
    q("scikit-learn", 4, "Write a pipeline that scales data then trains a logistic regression.", "coding", 2, "`Pipeline([('scaler', StandardScaler()), ('clf', LogisticRegression())])` then `.fit(X_train, y_train)`."),
  ],
  statistics: [
    q("statistics", 1, "What's the difference between mean and median, and when is the median better?", "technical", 1, "The median is robust to outliers; use it for skewed data like salaries or house prices."),
    q("statistics", 2, "What does a p-value tell you?", "technical", 2, "It's the probability of seeing data at least this extreme under the null hypothesis; small p-values reject the null."),
    q("statistics", 3, "What's a confidence interval?", "technical", 2, "A range of values, computed from the sample, that likely contains the true population parameter."),
    q("statistics", 4, "Explain type I versus type II error.", "technical", 2, "Type I is a false positive; type II is a false negative. They trade off against each other."),
  ],
  "data-visualisation": [
    q("data-visualisation", 1, "What makes a chart easy to read?", "technical", 1, "One clear message, labelled axes, a sensible scale, and no decoration that doesn't carry information."),
    q("data-visualisation", 2, "When would you use a bar chart versus a line chart?", "technical", 1, "Bar charts compare categories; line charts show trends over time."),
    q("data-visualisation", 3, "What's the danger of a dual-axis chart?", "technical", 2, "Two scales can mislead the eye and imply false correlations; use separate panels instead."),
    q("data-visualisation", 4, "How would you visualise the relationship between two continuous variables?", "technical", 1, "Use a scatter plot; add a trend line if you want to show the direction of the relationship."),
  ],
  "llm-apps": [
    q("llm-apps", 1, "What is retrieval-augmented generation (RAG)?", "technical", 2, "RAG retrieves relevant documents and feeds them to an LLM as context, so answers are grounded in your data."),
    q("llm-apps", 2, "What is prompt injection, and how do you defend against it?", "technical", 3, "A user tricks the model into ignoring instructions; defend with system-message boundaries, input sanitization, and never executing model output as code."),
    q("llm-apps", 3, "What's the difference between temperature 0 and temperature 1?", "technical", 1, "Temperature 0 is deterministic and focused; temperature 1 is more creative and varied."),
    q("llm-apps", 4, "How would you evaluate whether an LLM app's answers are correct?", "technical", 3, "Use a golden dataset with expected answers, LLM-as-judge scoring, and human spot-checks on edge cases."),
  ],
  "llm-evaluation": [
    q("llm-evaluation", 1, "What's an eval dataset, and what should it contain?", "technical", 2, "A set of inputs with expected outputs used to measure whether model changes improve or regress quality."),
    q("llm-evaluation", 2, "What is LLM-as-judge?", "technical", 2, "Using a strong model to score another model's answers against a rubric, faster than human labeling."),
    q("llm-evaluation", 3, "What's the difference between exact match and semantic similarity?", "technical", 2, "Exact match checks string equality; semantic similarity checks whether answers mean the same thing."),
    q("llm-evaluation", 4, "How would you detect regression when you change a prompt?", "technical", 3, "Run the eval set before and after, compare scores, and check that previously passing cases still pass."),
  ],
  "vector-databases": [
    q("vector-databases", 1, "What is a vector database used for?", "technical", 2, "Storing and searching embeddings so you can find items similar to a query by vector distance."),
    q("vector-databases", 2, "What's cosine similarity, and when is it useful?", "technical", 2, "It measures the angle between two vectors; useful for comparing documents regardless of length."),
    q("vector-databases", 3, "What's approximate nearest-neighbor search, and why use it?", "technical", 2, "ANN trades a little accuracy for much faster search on large vector collections (e.g. HNSW)."),
    q("vector-databases", 4, "How do you keep a vector index in sync with your source data?", "technical", 3, "Re-embed and upsert on every create/update/delete, or run a background sync job with change detection."),
  ],
  mlops: [
    q("mlops", 1, "What is MLOps, and how does it differ from DevOps?", "technical", 2, "MLOps applies DevOps ideas to machine learning: versioning data and models, monitoring drift, and automating retraining."),
    q("mlops", 2, "What is model drift, and how do you detect it?", "technical", 2, "Model drift is when input data or relationships change over time; detect it with monitoring on prediction distributions and performance."),
    q("mlops", 3, "What's a feature store?", "technical", 2, "A centralized store for engineered features so training and inference use the same definitions."),
    q("mlops", 4, "How would you automate retraining a model?", "system-design", 3, "Trigger on new data or performance drop, retrain on a schedule, evaluate, and promote the new model if it beats the current one."),
  ],
  "cloud-computing": [
    q("cloud-computing", 1, "What's the difference between IaaS, PaaS, and SaaS?", "technical", 1, "IaaS rents infrastructure (VMs), PaaS rents a platform (app hosting), SaaS rents ready-made software."),
    q("cloud-computing", 2, "What are the main benefits of the cloud over on-premises servers?", "technical", 1, "On-demand capacity, pay-as-you-go, no hardware to maintain, and global regions for low latency."),
    q("cloud-computing", 3, "What's a region versus an availability zone?", "technical", 2, "A region is a geographic area; availability zones are isolated data centers within a region for fault tolerance."),
    q("cloud-computing", 4, "How would you design for high availability in the cloud?", "system-design", 3, "Spread across availability zones, use load balancers and auto-scaling, and replicate data across regions."),
  ],
  "security-basics": [
    q("security-basics", 1, "What is the principle of least privilege?", "technical", 1, "Give a user or service only the permissions it absolutely needs to do its job."),
    q("security-basics", 2, "What is SQL injection, and how do you prevent it?", "technical", 2, "Attackers inject SQL via user input; prevent it with parameterized queries or an ORM, never string concatenation."),
    q("security-basics", 3, "Why shouldn't you store secrets in Git?", "technical", 1, "Git history is permanent and often public; leaked keys let attackers access your systems."),
    q("security-basics", 4, "What's the difference between authentication and authorization?", "technical", 1, "Authentication is 'who you are'; authorization is 'what you're allowed to do'."),
  ],
  communication: [
    q("communication", 1, "Tell me about a time you had to explain a technical concept to a non-technical person.", "behavioural", 2, "Focus on the analogy you used, how you checked for understanding, and the outcome."),
    q("communication", 2, "Describe a time you gave difficult feedback to a teammate. How did it go?", "behavioural", 2, "Use the situation-task-result structure and emphasize kindness and specificity."),
    q("communication", 3, "How do you handle it when you don't know the answer in a meeting?", "behavioural", 1, "Say you don't know, offer to find out, and follow up — it builds more trust than bluffing."),
    q("communication", 4, "Tell me about a presentation or write-up you're proud of.", "behavioural", 2, "Explain the audience, the message, and what changed as a result."),
  ],
  teamwork: [
    q("teamwork", 1, "Tell me about a time you disagreed with a teammate about a technical decision.", "behavioural", 2, "Describe the disagreement, how you listened, and how you reached a decision you could both support."),
    q("teamwork", 2, "Describe a time you helped a teammate who was stuck.", "behavioural", 1, "Focus on how you approached them, what you taught, and how they grew from it."),
    q("teamwork", 3, "How do you handle a teammate who isn't pulling their weight?", "behavioural", 2, "Speak to them privately, understand any blockers, and agree on clear next steps before escalating."),
    q("teamwork", 4, "Tell me about a project where the team succeeded because of collaboration.", "behavioural", 2, "Name the specific ways the team worked together and your own contribution."),
  ],
  agile: [
    q("agile", 1, "What's the purpose of a sprint retrospective?", "technical", 1, "It's the team's chance to reflect on what went well, what didn't, and what to try differently next sprint."),
    q("agile", 2, "What's the difference between Scrum and Kanban?", "technical", 1, "Scrum works in fixed-length sprints; Kanban pulls work continuously with work-in-progress limits."),
    q("agile", 3, "What makes a good user story?", "technical", 1, "A user story is small, valuable, and testable, with clear acceptance criteria."),
    q("agile", 4, "How do you handle scope creep mid-sprint?", "technical", 2, "Add new requests to the backlog, discuss trade-offs with the product owner, and protect the sprint goal."),
  ],
  "code-review": [
    q("code-review", 1, "What do you look for when reviewing a pull request?", "technical", 2, "Correctness, readability, tests, edge cases, security, and whether it matches the team's style."),
    q("code-review", 2, "How do you give review feedback that lands well?", "behavioural", 2, "Be specific, kind, and actionable; praise what's good, and frame suggestions as questions."),
    q("code-review", 3, "What do you do when you and the author disagree on a change?", "behavioural", 2, "Discuss the trade-offs openly, aim for the team standard, and escalate only if you can't agree."),
    q("code-review", 4, "How do you review code in a language you don't know well?", "behavioural", 1, "Focus on logic, naming, tests, and consistency rather than syntax; ask the author to explain unclear parts."),
  ],
};

// Default questions for any skill not in the bank: behavioural, kind, interview-relevant.
const DEFAULT_BEHAVIOURAL: InterviewQuestion[] = [
  q("generic", 1, `Tell me about a time you had to learn {{skill}} quickly. How did you approach it?`, "behavioural", 2, "Break the skill into small parts, find one good resource, and build something tiny with it right away."),
  q("generic", 2, `Describe a project where {{skill}} mattered. What was your role, and what did you ship?`, "behavioural", 2, "Focus on your own contribution, the decisions you made, and the outcome for the team or users."),
  q("generic", 3, `What do you find hardest about {{skill}}, and what are you doing to improve?`, "behavioural", 1, "Name a real weakness, then describe the concrete steps you're taking — practice, reading, or pairing."),
];

function skillQuestions(skillId: SkillId): InterviewQuestion[] {
  const banked = QUESTION_BANK[skillId];
  if (banked && banked.length) return banked.slice(0, QUESTIONS_PER_SKILL);
  return DEFAULT_BEHAVIOURAL.map((qn, i) => ({
    ...qn,
    id: `prep-generic-q${i + 1}`,
    skillId,
    question: qn.question.replace(/{{skill}}/g, skillName(skillId)),
  }));
}

/** Top gap nodes from the Bridge Map: status === "gap", highest demand first, capped. */
function topGaps(map: BridgeMap): BridgeNode[] {
  return [...map.nodes]
    .filter((n) => n.status === "gap")
    .sort((a, b) => b.demand - a.demand || a.skillId.localeCompare(b.skillId))
    .slice(0, MAX_GAPS);
}

function focusText(gaps: BridgeNode[], roleLabel?: string): string {
  if (!gaps.length) return "No interview gaps right now — keep practising your strongest skills, and you'll be ready.";
  const names = gaps.map((g) => g.skillId ? skillName(g.skillId) : g.skillId).join(" and ");
  const where = roleLabel ? ` for ${roleLabel} roles` : "";
  return `Focus your practice on ${names}${where}: they're your biggest gaps, so they're worth the most before your interview.`;
}

const AGENT: AgentName = "voice"; // best fit: no "interview-prep" name exists in AgentName; voice runs mock interviews

export async function buildInterviewPrep(input: {
  userId: string;
  roleId?: string;
  runId?: string;
}): Promise<InterviewPrepSlice[]> {
  const runId = input.runId ?? newRunId();
  emit({ runId, agent: AGENT, status: "started", message: "Building your gap-tailored interview prep." });

  let map: BridgeMap | null;
  try {
    map = await loadGraph(input.userId, input.roleId ?? "");
  } catch {
    emit({ runId, agent: AGENT, status: "error", message: "We couldn't load your Bridge Map, so there's no prep to show yet. That's on us, not you." });
    return [];
  }
  if (!map) {
    emit({ runId, agent: AGENT, status: "error", message: "We couldn't find a Bridge Map for you yet, so there's nothing to prepare against. Start by building your map." });
    return [];
  }

  // Read the proof ladder too (keystone's ladder knows your gaps and demand for the target role).
  const ladder = await getProofLadder(input.userId).catch(() => null);

  const gaps = topGaps(map);
  const roleLabel = map.roleId ? roleNameOf(map.roleId) : undefined;

  emit({
    runId, agent: AGENT, status: "progress", message: `Found ${gaps.length} gap skill${gaps.length === 1 ? "" : "s"} to practise before your interview.`,
    data: { skillCount: gaps.length, ladderSkills: ladder?.skills.length ?? 0, gaps: gaps.map((g) => g.skillId) },
  });

  const prep = gaps.map((g) => {
    const questions = skillQuestions(g.skillId);
    return {
      skillId: g.skillId,
      questions,
      focus: focusText([g], roleLabel),
    };
  });

  emit({
    runId, agent: AGENT, status: "done", message: prep.length ? `Your prep is ready: ${prep.length} skill${prep.length === 1 ? "" : "s"}, each with questions and a tip.` : "No gaps to prepare — you're in good shape.",
    data: { skillCount: prep.length, totalQuestions: prep.reduce((s, p) => s + p.questions.length, 0) },
  });
  return prep;
}

function roleNameOf(roleId: string): string {
  const names: Record<string, string> = {
    "ml-engineer": "ML engineer",
    "software-engineer": "software engineer",
    "data-analyst": "data analyst",
    "data-scientist": "data scientist",
    "frontend-engineer": "frontend engineer",
    "devops-engineer": "devops engineer",
  };
  return names[roleId] ?? roleId.replace(/-/g, " ");
}
