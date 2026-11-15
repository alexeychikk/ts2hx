class St {
  static count = 0;
  static inc(): void {
    ++this.count;
  }
}
class St2 extends St {}
St.inc();
console.log(St.count, St2.count);
St2.inc();
St2.inc();
console.log(St.count, St2.count);
St2.count = 5;
St2.count += 1;
console.log(St.count, St2.count);
