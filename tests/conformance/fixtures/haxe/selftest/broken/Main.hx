package __PACKAGE__;

class Main {
  public static function main() {
    #if cpp
    untyped __cpp__("this_is_not_cpp(;");
    #elseif cs
    untyped __cs__("this_is_not_csharp(;");
    #else
    var notAnInt:Int = "a string";
    #end
  }
}
