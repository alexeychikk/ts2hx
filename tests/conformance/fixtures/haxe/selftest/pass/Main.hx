package __PACKAGE__;

class Main {
  public static function main() {
    println("hello");
    println("3");
  }

  static function println(line:String) {
    #if js
    js.Syntax.code("console.log({0})", line);
    #else
    Sys.println(line);
    #end
  }
}
