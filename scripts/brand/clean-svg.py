import re,sys
src,out,drop=sys.argv[1],sys.argv[2],sys.argv[3:]
s=open(src).read()
paths=re.findall(r'^<path fill-rule="nonzero" fill="[^"]+" fill-opacity="1" d="[^"]+"/>',s,re.M)
keep=[p for p in paths if not any(d in p for d in drop)]
def col(m):
  r,g,b=[round(float(x)*2.55) for x in m.groups()]
  return 'fill="#%02X%02X%02X"'%(r,g,b)
keep=[re.sub(r'fill="rgb\(([\d.]+)%, ([\d.]+)%, ([\d.]+)%\)"',col,p).replace(' fill-opacity="1"','').replace('fill-rule="nonzero" ','') for p in keep]
open(out,'w').write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 600">\n'+'\n'.join(keep)+'\n</svg>\n')
print(out,len(keep))
