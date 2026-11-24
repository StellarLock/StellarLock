import re
from collections import Counter

with open('c:/Users/user/Desktop/StellarLock-1/contracts/token-locker/src/tests.rs', 'r') as f:
    lines = f.readlines()

funcs = []
for i, line in enumerate(lines, 1):
    m = re.search(r'fn\s+(\w+)', line)
    if m:
        funcs.append((i, m.group(1)))

counts = Counter(name for _, name in funcs)
dups = {k: v for k, v in counts.items() if v > 1}

if dups:
    print("Duplicate function names found:")
    for name, count in dups.items():
        print(f"\n  '{name}' appears {count} times at:")
        for line_no, fn_name in funcs:
            if fn_name == name:
                print(f"    Line {line_no}")
else:
    print("No duplicate function names found - all unique!")

print(f"\nTotal functions: {len(funcs)}, Unique names: {len(counts)}")

