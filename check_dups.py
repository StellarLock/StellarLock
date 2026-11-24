import re
from collections import Counter

with open('c:/Users/user/Desktop/StellarLock-1/contracts/token-locker/src/tests.rs', 'r') as f:
    content = f.read()

# Find all function names
funcs = re.findall(r'fn\s+(\w+)', content)
counts = Counter(funcs)
dups = {k: v for k, v in counts.items() if v > 1}

with open('c:/Users/user/Desktop/StellarLock-1/dups_result.txt', 'w') as out:
    if dups:
        out.write("Duplicate function names found:\n")
        for name, count in dups.items():
            out.write(f"  '{name}' appears {count} times\n")
            for i, line in enumerate(content.split('\n'), 1):
                if re.search(r'fn\s+' + re.escape(name), line):
                    out.write(f"    Line {i}: {line.strip()}\n")
    else:
        out.write("No duplicate function names found - all unique!\n")
    
    out.write(f"\nTotal functions: {len(funcs)}, Unique names: {len(counts)}\n")
    
    # Also list all functions
    out.write("\nAll functions:\n")
    for i, line in enumerate(content.split('\n'), 1):
        m = re.search(r'fn\s+(\w+)', line)
        if m:
            out.write(f"  Line {i}: {m.group(1)}\n")

