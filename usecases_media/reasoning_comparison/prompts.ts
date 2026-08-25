import type { PromptExample } from "@/components/PromptExamples";

export const reasoningComparisonPrompts: readonly PromptExample[] = [
  {
    id: "bridge-and-torch",
    title: "Bridge and torch optimization",
    prompt: `Four people must cross a bridge at night with one torch. At most two people can cross at once, they must carry the torch, and a pair travels at the slower person's speed. Their crossing times are 1, 2, 7, and 10 minutes. What is the minimum total time, and why is your strategy optimal? Enumerate the meaningful strategy choices rather than giving only an answer.`,
    description:
      "Requires optimization, comparison of competing strategies, and a proof that no faster schedule exists.",
    answer:
      "Minimum: 17 minutes. Send 1+2 across (2), 1 returns (1), 7+10 cross (10), 2 returns (2), then 1+2 cross (2): 2+1+10+2+2 = 17. The alternative of using the fastest person to escort both slow people takes 1+10+1+7+1 = 20, so 17 is better. Any valid schedule must transport both 7 and 10 across; the two-return strategy is the only way to avoid paying one of their crossing times as a return, and comparing the two possible return patterns yields 17 as the lower bound.",
    badges: ["Optimization", "Proof"],
  },
  {
    id: "counterfeit-coin",
    title: "Find the counterfeit coin",
    prompt: `You have 12 visually identical coins. Exactly one is counterfeit, but you do not know whether it is heavier or lighter. Using a balance scale exactly three times, design a decision tree that always identifies the counterfeit coin and whether it is heavy or light. Give the weighing outcomes for every branch.`,
    description:
      "A 24-state search problem: a strong response must maintain both coin identity and weight hypotheses across all branches.",
    answer:
      "Use the standard 3-coin split: weigh 1,2,3,4 against 5,6,7,8. If balanced, the counterfeit is among 9-12; weigh 9,10,11 against 1,2,3, then resolve the remaining candidates with the third weighing. If left is heavy, the hypotheses are 1-4 heavy or 5-8 light; use a rearranged second weighing such as 1,2,5 against 3,6,9 and branch on the result. If right is heavy, mirror the hypotheses. Each branch must preserve exactly three or fewer viable hypotheses before the final weighing. The complete decision tree is lengthy; the important correctness criterion is that every outcome maps to at most one of the 24 possibilities.",
    badges: ["Decision tree", "Exhaustive search"],
  },
  {
    id: "logic-grid-four-days",
    title: "Four-day scheduling grid",
    prompt: `A team presents four demos - Atlas, Beacon, Comet, and Delta - on Monday through Thursday, one per day. Each demo has a different owner: Ada, Bo, Chen, and Daria. Determine the full schedule from these clues:
1. Atlas is presented before the demo owned by Chen.
2. Bo presents exactly one day after Beacon.
3. Comet is neither Monday nor Thursday.
4. Daria owns Delta.
5. Atlas is presented on the day before Delta.
6. Ada does not own Atlas.
Show a deduction table and prove the solution is unique.`,
    description:
      "Combines ordering, adjacency, and identity constraints; guessing a plausible schedule is not enough.",
    answer:
      "The clues as written do not force a unique solution: Monday Atlas, Tuesday Delta, Wednesday Beacon, Thursday Comet with owners Ada, Daria, Bo, Chen satisfies all six clues, but other assignments can also satisfy them. A correct response should identify this under-specification rather than inventing uniqueness, then give a counterexample or state the additional clue needed. This is intentionally a consistency-and-uniqueness test.",
    badges: ["Constraint satisfaction", "Uniqueness check"],
  },
  {
    id: "monty-hall-variant",
    title: "A biased Monty Hall variant",
    prompt: `There are three doors: one has a car and two have goats. You choose Door 1. The host knows where the car is and always opens a goat door, but when both goat doors are available, he chooses Door 2 with probability 2/3 and Door 3 with probability 1/3. The host opens Door 2. What is the probability the car is behind Door 1, and should you switch to Door 3? Derive the answer with conditional probabilities; do not rely on the usual symmetric Monty Hall shortcut.`,
    description:
      "Tests whether the model updates on the host's biased behavior instead of applying a memorized 1/3-versus-2/3 template.",
    answer:
      "P(car at Door 1 | host opens Door 2) = (1/3) / [(1/3) + (2/3)(2/3)] = 3/7. If the car is at Door 3, the host must open Door 2, contributing probability 2/3; if it is at Door 2, he cannot open Door 2. Thus P(car at Door 3 | opens Door 2) = 4/7. Switching wins with probability 4/7, not 2/3.",
    badges: ["Bayesian reasoning", "Conditional probability"],
  },
  {
    id: "concurrency-race",
    title: "Trace the concurrency bug",
    prompt: `Review this Python code. It is intended to increment a shared counter to 200000, but sometimes prints a smaller value. Explain the exact interleaving that loses an update, then provide two correct fixes: one using a lock and one avoiding shared mutable state.

counter = 0

def increment_many():
    global counter
    for _ in range(100000):
        current = counter
        counter = current + 1

threads = [Thread(target=increment_many) for _ in range(2)]
for thread in threads: thread.start()
for thread in threads: thread.join()
print(counter)`,
    description:
      "Requires reasoning about an interleaving, not just spotting that threads are involved, and comparing two repair strategies.",
    answer:
      "A lost update occurs when both threads read the same value n before either writes: both compute n+1 and both store n+1, so two increments produce one change. Protect the read-modify-write with a shared threading.Lock. Alternatively, have each thread return its local count and sum the results after join (or use a thread pool), avoiding shared mutation entirely. In CPython, the GIL does not make this compound operation a correctness guarantee.",
    badges: ["Code reasoning", "Concurrency"],
  },
  {
    id: "knights-and-knaves",
    title: "Knights, knaves, and a liar",
    prompt: `On an island, knights always tell the truth and knaves always lie. Three inhabitants A, B, and C make these statements:
A: "B is a knave."
B: "C is a knave."
C: "A and B are of different types."
Determine every logically consistent assignment of knight/knave types. If there is more than one, explain why the evidence is insufficient; do not force a single answer.`,
    description:
      "The challenge is to solve the Boolean constraints completely and detect whether the puzzle is underdetermined.",
    answer:
      "There are two solutions. (A=knight, B=knave, C=knave) satisfies all statements. (A=knave, B=knave, C=knight) also satisfies them: A lies because B is not a knave is false; B lies because C is a knave is false; C tells the truth because A and B differ. Therefore the clues do not identify a unique assignment.",
    badges: ["Boolean logic", "Ambiguity detection"],
  },
  {
    id: "algorithm-complexity",
    title: "Find the hidden complexity",
    prompt: `A function receives a sorted array of n distinct integers and a target t:

def count_pairs(values, t):
    result = []
    for i in range(len(values)):
        left, right = i + 1, len(values) - 1
        while left <= right:
            middle = (left + right) // 2
            if values[i] + values[middle] == t:
                result.append((i, middle))
                break
            if values[i] + values[middle] < t:
                left = middle + 1
            else:
                right = middle - 1
    return result

Prove the tight worst-case time and space complexity. Then design an O(n) two-pointer solution and explain why it is correct.`,
    description:
      "Combines asymptotic analysis with algorithm design and a correctness argument.",
    answer:
      "The given function performs n binary searches, so its tight worst-case time is O(n log n); result storage is O(k), where k is the number of pairs and k <= n, hence O(n) worst-case auxiliary/output space. The linear solution starts i=0 and j=n-1, compares values[i]+values[j] with t, moves j left if the sum is too large, and moves i right if it is too small; on equality, record the pair and move both pointers. Sortedness guarantees that discarded regions cannot contain a missed pair, giving O(n) time and O(k) output space.",
    badges: ["Algorithms", "Complexity proof"],
  },
  {
    id: "self-referential-sentence",
    title: "The self-referential sentence",
    prompt: `Find every integer n from 0 through 30 for which this sentence is true when n is written in English in the blank:
"This sentence contains exactly n letter e's."
Count letters in the entire completed sentence, including the number word but excluding quotation marks and spaces. Show a systematic method and explain whether the solution is unique.`,
    description:
      "A fixed-point search where the candidate changes the text being counted; reliable answers require explicit counting rather than intuition.",
    answer:
      'The unique fixed point from 0 through 30 is 8. Insert the word "eight" and count the e\'s in the completed sentence: "This sentence contains exactly eight letter e\'s." It contains 8 e\'s in total, so the statement is true. Checking the other number words produces counts different from their numeric values.',
    badges: ["Fixed point", "Systematic enumeration"],
  },
  {
    id: "induction-counterexample",
    title: "Repair the false proof",
    prompt: `A student claims to have proved: "Every set of n horses consists of horses of the same color."
Their proof says the base case n=1 is true. For the induction step, remove one horse from a set of n+1 horses, use the hypothesis on the remaining n horses, then remove a different horse and use the hypothesis again. The two groups of n horses overlap, so their colors must match.
Identify the exact first value of n where the argument fails, explain why the overlap claim breaks there, and give a counterexample to the theorem.`,
    description:
      "Tests whether the model audits a proof's boundary condition instead of accepting familiar induction language.",
    answer:
      "The induction step first fails from n=1 to n=2. With two horses, the two one-horse subsets have no overlap at all, so their colors need not match. A counterexample is one black horse and one white horse. The theorem is false; the proof's hidden assumption is that the two n-element subsets share at least one horse, which requires n >= 2.",
    badges: ["Proof critique", "Boundary conditions"],
  },
];
