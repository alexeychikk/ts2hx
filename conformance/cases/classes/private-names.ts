class Account {
  #balance: number;
  #history: number[] = [];
  static #created = 0;
  readonly #id: number;

  constructor(initial: number) {
    this.#balance = initial;
    Account.#created++;
    this.#id = Account.#created;
  }

  #record(amount: number): void {
    this.#history.push(amount);
  }

  deposit(amount: number): this {
    this.#balance += amount;
    this.#record(amount);
    return this;
  }

  get balance(): number {
    return this.#balance;
  }

  sameOwner(other: Account): boolean {
    return this.#id === other.#id;
  }

  transferTo(other: Account, amount: number): void {
    this.#balance -= amount;
    other.#balance += amount;
    other.#record(amount);
  }

  static created(): number {
    return Account.#created;
  }

  summary(): string {
    return `#${this.#id}: ${this.#balance} after ${this.#history.length} ops`;
  }
}

class Savings extends Account {
  #rate: number;
  constructor(initial: number, rate: number) {
    super(initial);
    this.#rate = rate;
  }
  addInterest(): void {
    this.deposit(this.balance * this.#rate);
  }
}

const a = new Account(10);
const b = new Account(5);
a.deposit(5).deposit(2.5);
a.transferTo(b, 7);
console.log(a.summary());
console.log(b.summary());
console.log(a.sameOwner(a), a.sameOwner(b), Account.created());
const s = new Savings(100, 0.5);
s.addInterest();
console.log(s.summary(), Account.created());
