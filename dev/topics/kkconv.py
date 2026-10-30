import cmudict,re
CMU=cmudict.dict()
V={'AA':'ɑ','AE':'æ','AH':'ʌ','AO':'ɔ','AW':'aʊ','AY':'aɪ','EH':'ɛ','ER':'ɝ','EY':'e','IH':'ɪ','IY':'i','OW':'o','OY':'ɔɪ','UH':'ʊ','UW':'u'}
C={'B':'b','CH':'tʃ','D':'d','DH':'ð','F':'f','G':'g','HH':'h','JH':'dʒ','K':'k','L':'l','M':'m','N':'n','NG':'ŋ','P':'p','R':'r','S':'s','SH':'ʃ','T':'t','TH':'θ','V':'v','W':'w','Y':'j','Z':'z','ZH':'ʒ'}
ONS2={'pl','pr','bl','br','tr','dr','kl','kr','gl','gr','fl','fr','θr','ʃr','sp','st','sk','sm','sn','sl','sw','tw','kw','dw','gw','θw','hj','pj','bj','tj','dj','kj','mj','nj','fj','vj','sj','lj','zj'}
def vowel(p):
    b=re.sub(r'\d','',p); s=p[-1]
    if b=='AH': return 'ə' if s=='0' else 'ʌ'
    if b=='ER': return 'ɚ' if s=='0' else 'ɝ'
    return V[b]
def conv(phs):
    # syllables: list of (stress, onset[], nucleus, coda[])
    segs=[]
    phs=list(phs)
    q=[]
    for i,p in enumerate(phs):
        if p=='ER0' and i+1<len(phs) and re.sub(r'\d','',phs[i+1]) in V: q+=['AH0','R']
        else: q.append(p)
    phs=q
    for p in phs:
        b=re.sub(r'\d','',p)
        if b in V: segs.append(('V',p))
        else: segs.append(('C',C[b]))
    vi=[i for i,s in enumerate(segs) if s[0]=='V']
    if not vi: return None
    # assign consonants between vowels
    sylls=[]
    start=0
    cons_before=[]
    bounds=[]
    for a,b in zip(vi,vi[1:]):
        cl=[segs[i][1] for i in range(a+1,b)]
        # maximal onset
        k=len(cl)
        take=0
        if k>=1: take=1
        if k>=2 and (cl[-2]+cl[-1]) in ONS2: take=2
        if k>=3 and cl[-3]=='s' and (cl[-2]+cl[-1]) in ONS2: take=3
        bounds.append(b-take)  # index where next syllable's onset starts
    out=[]
    starts=[0]+bounds
    ends=bounds+[len(segs)]
    res=[]
    for si,(s,e) in enumerate(zip(starts,ends)):
        stress=None
        txt=''
        for i in range(s,e):
            t,p=segs[i]
            if t=='V':
                stress=p[-1]; txt+=vowel(p)
            else: txt+=p
        res.append((stress,txt))
    o=''
    for st,t in res:
        o+=('ˈ' if st=='1' else 'ˌ' if st=='2' else '')+t
    # single syllable: drop stress mark
    if len(res)==1: o=o.replace('ˈ','').replace('ˌ','')
    # primary only mark ok
    return o
def kk(w):
    p=CMU.get(w.lower())
    if not p: return None
    return conv(p[0]),[conv(x) for x in p]
