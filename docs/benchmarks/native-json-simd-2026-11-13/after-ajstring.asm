
.build/native-fastpaths-2026-11-13/json-simd/after:	file format mach-o arm64

Disassembly of section __TEXT,__text:

000000010001f680 <_ajstring>:
10001f680:     	sub	sp, sp, #0x80
10001f684:     	stp	x28, x27, [sp, #0x20]
10001f688:     	stp	x26, x25, [sp, #0x30]
10001f68c:     	stp	x24, x23, [sp, #0x40]
10001f690:     	stp	x22, x21, [sp, #0x50]
10001f694:     	stp	x20, x19, [sp, #0x60]
10001f698:     	stp	x29, x30, [sp, #0x70]
10001f69c:     	add	x29, sp, #0x70
10001f6a0:     	mov	x19, x8
10001f6a4:     	ldp	x9, x11, [x0, #0x8]
10001f6a8:     	cmp	x11, x9
10001f6ac:     	b.hs	0x10001f764 <_ajstring+0xe4>
10001f6b0:     	ldr	x8, [x0]
10001f6b4:     	add	x20, x11, #0x1
10001f6b8:     	str	x20, [x0, #0x10]
10001f6bc:     	ldrh	w10, [x8, x11, lsl #1]
10001f6c0:     	cmp	w10, #0x22
10001f6c4:     	b.ne	0x10001f764 <_ajstring+0xe4>
10001f6c8:     	sub	x12, x9, x20
10001f6cc:     	mov	x10, x20
10001f6d0:     	cmp	x12, #0x8
10001f6d4:     	b.lo	0x10001f728 <_ajstring+0xa8>
10001f6d8:     	mvn	x10, x11
10001f6dc:     	add	x11, x8, x11, lsl #1
10001f6e0:     	add	x11, x11, #0x2
10001f6e4:     	movi.8h	v0, #0x22
10001f6e8:     	movi.8h	v1, #0x5c
10001f6ec:     	movi.8h	v2, #0x20
10001f6f0:     	ldr	q3, [x11], #0x10
10001f6f4:     	cmeq.8h	v4, v3, v0
10001f6f8:     	cmeq.8h	v5, v3, v1
10001f6fc:     	orr.16b	v4, v4, v5
10001f700:     	cmhi.8h	v3, v2, v3
10001f704:     	orr.16b	v3, v3, v4
10001f708:     	xtn.8b	v3, v3
10001f70c:     	fmov	x12, d3
10001f710:     	cbnz	x12, 0x10001f7ac <_ajstring+0x12c>
10001f714:     	sub	x10, x10, #0x8
10001f718:     	add	x12, x9, x10
10001f71c:     	cmp	x12, #0x7
10001f720:     	b.hi	0x10001f6f0 <_ajstring+0x70>
10001f724:     	neg	x10, x10
10001f728:     	cmp	x10, x9
10001f72c:     	b.hs	0x10001f7bc <_ajstring+0x13c>
10001f730:     	ldrh	w11, [x8, x10, lsl #1]
10001f734:     	and	w11, w11, #0xffff
10001f738:     	cmp	w11, #0x20
10001f73c:     	b.lo	0x10001f7bc <_ajstring+0x13c>
10001f740:     	cmp	w11, #0x22
10001f744:     	b.eq	0x10001f7bc <_ajstring+0x13c>
10001f748:     	cmp	w11, #0x5c
10001f74c:     	b.eq	0x10001f7bc <_ajstring+0x13c>
10001f750:     	add	x10, x10, #0x1
10001f754:     	cmp	x9, x10
10001f758:     	b.ne	0x10001f730 <_ajstring+0xb0>
10001f75c:     	str	x9, [x0, #0x10]
10001f760:     	b	0x10001f7c8 <_ajstring+0x148>
10001f764:     	adrp	x0, 0x100067000 <_write+0x100067000>
10001f768:     	add	x0, x0, #0x5e8
10001f76c:     	adrp	x1, 0x100067000 <_write+0x100067000>
10001f770:     	add	x1, x1, #0x533
10001f774:     	add	x8, sp, #0x8
10001f778:     	bl	0x100002fd8 <_afail>
10001f77c:     	stp	xzr, xzr, [x19]
10001f780:     	str	xzr, [x19, #0x10]
10001f784:     	mov	w8, #0x1                ; =1
10001f788:     	str	w8, [x19]
10001f78c:     	ldp	x29, x30, [sp, #0x70]
10001f790:     	ldp	x20, x19, [sp, #0x60]
10001f794:     	ldp	x22, x21, [sp, #0x50]
10001f798:     	ldp	x24, x23, [sp, #0x40]
10001f79c:     	ldp	x26, x25, [sp, #0x30]
10001f7a0:     	ldp	x28, x27, [sp, #0x20]
10001f7a4:     	add	sp, sp, #0x80
10001f7a8:     	ret
10001f7ac:     	rbit	x11, x12
10001f7b0:     	clz	x11, x11
10001f7b4:     	lsr	x11, x11, #3
10001f7b8:     	sub	x10, x11, x10
10001f7bc:     	str	x10, [x0, #0x10]
10001f7c0:     	cmp	x10, x9
10001f7c4:     	b.ne	0x10001f7dc <_ajstring+0x15c>
10001f7c8:     	adrp	x0, 0x100067000 <_write+0x100067000>
10001f7cc:     	add	x0, x0, #0x5e8
10001f7d0:     	adrp	x1, 0x100067000 <_write+0x100067000>
10001f7d4:     	add	x1, x1, #0x549
10001f7d8:     	b	0x10001f774 <_ajstring+0xf4>
10001f7dc:     	ldrh	w9, [x8, x10, lsl #1]
10001f7e0:     	cmp	w9, #0x22
10001f7e4:     	b.ne	0x10001f824 <_ajstring+0x1a4>
10001f7e8:     	add	x9, x10, #0x1
10001f7ec:     	str	x9, [x0, #0x10]
10001f7f0:     	sub	x2, x10, x20
10001f7f4:     	add	x9, x8, x20, lsl #1
10001f7f8:     	mov	x8, x19
10001f7fc:     	mov	x3, x1
10001f800:     	mov	x1, x9
10001f804:     	ldp	x29, x30, [sp, #0x70]
10001f808:     	ldp	x20, x19, [sp, #0x60]
10001f80c:     	ldp	x22, x21, [sp, #0x50]
10001f810:     	ldp	x24, x23, [sp, #0x40]
10001f814:     	ldp	x26, x25, [sp, #0x30]
10001f818:     	ldp	x28, x27, [sp, #0x20]
10001f81c:     	add	sp, sp, #0x80
10001f820:     	b	0x10001fc30 <_ajstring_value>
10001f824:     	sub	x25, x10, x20
10001f828:     	ldr	x8, [x0, #0x30]
10001f82c:     	add	x9, x25, #0x1
10001f830:     	cmp	x8, x9
10001f834:     	mov	x23, x1
10001f838:     	mov	x24, x0
10001f83c:     	b.hs	0x10001f874 <_ajstring+0x1f4>
10001f840:     	add	x21, x25, #0x40
10001f844:     	ldr	x0, [x0, #0x28]
10001f848:     	bl	0x100053814 <_write+0x100053814>
10001f84c:     	lsl	x8, x21, #1
10001f850:     	cmp	x8, #0x1
10001f854:     	csinc	x0, x8, xzr, hi
10001f858:     	mov	w1, #0x1                ; =1
10001f85c:     	bl	0x1000536d0 <_write+0x1000536d0>
10001f860:     	cbz	x0, 0x10001fc2c <_ajstring+0x5ac>
10001f864:     	mov	x8, x0
10001f868:     	mov	x0, x24
10001f86c:     	stp	x8, x21, [x24, #0x28]
10001f870:     	mov	x1, x23
10001f874:     	cbz	x25, 0x10001f898 <_ajstring+0x218>
10001f878:     	ldr	x8, [x0, #0x28]
10001f87c:     	ldr	x9, [x0]
10001f880:     	add	x1, x9, x20, lsl #1
10001f884:     	lsl	x2, x25, #1
10001f888:     	mov	x0, x8
10001f88c:     	bl	0x10005391c <_write+0x10005391c>
10001f890:     	mov	x0, x24
10001f894:     	mov	x1, x23
10001f898:     	ldp	x9, x8, [x0, #0x8]
10001f89c:     	adrp	x26, 0x100074000 <_amain_task+0x3ff0>
10001f8a0:     	cmp	x8, x9
10001f8a4:     	b.hs	0x10001fb74 <_ajstring+0x4f4>
10001f8a8:     	mov	w27, #0x1               ; =1
10001f8ac:     	mov	x28, #0x2001            ; =8193
10001f8b0:     	movk	x28, #0x400, lsl #48
10001f8b4:     	adrp	x21, 0x100067000 <_write+0x100067000>
10001f8b8:     	add	x21, x21, #0x599
10001f8bc:     	b	0x10001f8d8 <_ajstring+0x258>
10001f8c0:     	add	x22, x25, #0x1
10001f8c4:     	strh	w20, [x8, x25, lsl #1]
10001f8c8:     	ldp	x9, x8, [x0, #0x8]
10001f8cc:     	mov	x25, x22
10001f8d0:     	cmp	x8, x9
10001f8d4:     	b.hs	0x10001fb78 <_ajstring+0x4f8>
10001f8d8:     	ldr	x10, [x0]
10001f8dc:     	add	x12, x8, #0x1
10001f8e0:     	str	x12, [x0, #0x10]
10001f8e4:     	ldrh	w20, [x10, x8, lsl #1]
10001f8e8:     	cmp	w20, #0x22
10001f8ec:     	b.eq	0x10001fb84 <_ajstring+0x504>
10001f8f0:     	cmp	w20, #0x1f
10001f8f4:     	b.ls	0x10001fb8c <_ajstring+0x50c>
10001f8f8:     	cmp	w20, #0x5c
10001f8fc:     	b.ne	0x10001fadc <_ajstring+0x45c>
10001f900:     	cmp	x12, x9
10001f904:     	b.eq	0x10001fba0 <_ajstring+0x520>
10001f908:     	add	x11, x8, #0x2
10001f90c:     	str	x11, [x0, #0x10]
10001f910:     	ldrh	w20, [x10, x12, lsl #1]
10001f914:     	cmp	w20, #0x65
10001f918:     	b.le	0x10001f94c <_ajstring+0x2cc>
10001f91c:     	cmp	w20, #0x71
10001f920:     	b.le	0x10001f974 <_ajstring+0x2f4>
10001f924:     	cmp	w20, #0x72
10001f928:     	b.eq	0x10001f994 <_ajstring+0x314>
10001f92c:     	cmp	w20, #0x74
10001f930:     	b.eq	0x10001f98c <_ajstring+0x30c>
10001f934:     	cmp	w20, #0x75
10001f938:     	b.ne	0x10001fc18 <_ajstring+0x598>
10001f93c:     	cmp	x11, x9
10001f940:     	b.ne	0x10001f9a4 <_ajstring+0x324>
10001f944:     	mov	w22, #0x0               ; =0
10001f948:     	b	0x10001fabc <_ajstring+0x43c>
10001f94c:     	sub	w8, w20, #0x22
10001f950:     	cmp	w8, #0x3a
10001f954:     	lsl	x8, x27, x8
10001f958:     	and	x8, x8, x28
10001f95c:     	ccmp	x8, #0x0, #0x4, ls
10001f960:     	b.ne	0x10001fadc <_ajstring+0x45c>
10001f964:     	cmp	w20, #0x62
10001f968:     	b.ne	0x10001fc18 <_ajstring+0x598>
10001f96c:     	mov	w20, #0x8               ; =8
10001f970:     	b	0x10001fadc <_ajstring+0x45c>
10001f974:     	cmp	w20, #0x66
10001f978:     	b.eq	0x10001f99c <_ajstring+0x31c>
10001f97c:     	cmp	w20, #0x6e
10001f980:     	b.ne	0x10001fc18 <_ajstring+0x598>
10001f984:     	mov	w20, #0xa               ; =10
10001f988:     	b	0x10001fadc <_ajstring+0x45c>
10001f98c:     	mov	w20, #0x9               ; =9
10001f990:     	b	0x10001fadc <_ajstring+0x45c>
10001f994:     	mov	w20, #0xd               ; =13
10001f998:     	b	0x10001fadc <_ajstring+0x45c>
10001f99c:     	mov	w20, #0xc               ; =12
10001f9a0:     	b	0x10001fadc <_ajstring+0x45c>
10001f9a4:     	ldrh	w11, [x10, x11, lsl #1]
10001f9a8:     	sub	w12, w11, #0x30
10001f9ac:     	cmp	w12, #0xa
10001f9b0:     	b.hs	0x10001f9e4 <_ajstring+0x364>
10001f9b4:     	mov	w12, #-0x30             ; =-48
10001f9b8:     	add	x13, x8, #0x3
10001f9bc:     	str	x13, [x0, #0x10]
10001f9c0:     	add	w22, w12, w11
10001f9c4:     	cmp	x13, x9
10001f9c8:     	b.eq	0x10001fabc <_ajstring+0x43c>
10001f9cc:     	ldrh	w11, [x10, x13, lsl #1]
10001f9d0:     	sub	w12, w11, #0x30
10001f9d4:     	cmp	w12, #0xa
10001f9d8:     	b.hs	0x10001fa14 <_ajstring+0x394>
10001f9dc:     	mov	w12, #-0x30             ; =-48
10001f9e0:     	b	0x10001fa44 <_ajstring+0x3c4>
10001f9e4:     	sub	w12, w11, #0x61
10001f9e8:     	cmp	w12, #0x6
10001f9ec:     	b.hs	0x10001fa00 <_ajstring+0x380>
10001f9f0:     	cmp	w11, #0x56
10001f9f4:     	b.ls	0x10001f944 <_ajstring+0x2c4>
10001f9f8:     	mov	w12, #-0x57             ; =-87
10001f9fc:     	b	0x10001f9b8 <_ajstring+0x338>
10001fa00:     	sub	w12, w11, #0x47
10001fa04:     	cmn	w12, #0x6
10001fa08:     	b.lo	0x10001f944 <_ajstring+0x2c4>
10001fa0c:     	mov	w12, #-0x37             ; =-55
10001fa10:     	b	0x10001f9b8 <_ajstring+0x338>
10001fa14:     	sub	w12, w11, #0x61
10001fa18:     	cmp	w12, #0x6
10001fa1c:     	b.hs	0x10001fa30 <_ajstring+0x3b0>
10001fa20:     	cmp	w11, #0x57
10001fa24:     	b.lo	0x10001fabc <_ajstring+0x43c>
10001fa28:     	mov	w12, #-0x57             ; =-87
10001fa2c:     	b	0x10001fa40 <_ajstring+0x3c0>
10001fa30:     	sub	w12, w11, #0x47
10001fa34:     	cmn	w12, #0x6
10001fa38:     	b.lo	0x10001fabc <_ajstring+0x43c>
10001fa3c:     	mov	w12, #-0x37             ; =-55
10001fa40:     	mov	x0, x24
10001fa44:     	add	x13, x8, #0x4
10001fa48:     	str	x13, [x0, #0x10]
10001fa4c:     	add	w11, w12, w11
10001fa50:     	add	w22, w11, w22, lsl #4
10001fa54:     	cmp	x13, x9
10001fa58:     	b.eq	0x10001fabc <_ajstring+0x43c>
10001fa5c:     	ldrh	w11, [x10, x13, lsl #1]
10001fa60:     	sub	w12, w11, #0x30
10001fa64:     	cmp	w12, #0xa
10001fa68:     	b.hs	0x10001fa74 <_ajstring+0x3f4>
10001fa6c:     	mov	w12, #-0x30             ; =-48
10001fa70:     	b	0x10001faa4 <_ajstring+0x424>
10001fa74:     	sub	w12, w11, #0x61
10001fa78:     	cmp	w12, #0x6
10001fa7c:     	b.hs	0x10001fa90 <_ajstring+0x410>
10001fa80:     	cmp	w11, #0x57
10001fa84:     	b.lo	0x10001fabc <_ajstring+0x43c>
10001fa88:     	mov	w12, #-0x57             ; =-87
10001fa8c:     	b	0x10001faa0 <_ajstring+0x420>
10001fa90:     	sub	w12, w11, #0x47
10001fa94:     	cmn	w12, #0x6
10001fa98:     	b.lo	0x10001fabc <_ajstring+0x43c>
10001fa9c:     	mov	w12, #-0x37             ; =-55
10001faa0:     	mov	x0, x24
10001faa4:     	add	x13, x8, #0x5
10001faa8:     	str	x13, [x0, #0x10]
10001faac:     	add	w11, w12, w11
10001fab0:     	add	w22, w11, w22, lsl #4
10001fab4:     	cmp	x13, x9
10001fab8:     	b.ne	0x10001fb18 <_ajstring+0x498>
10001fabc:     	add	x8, sp, #0x8
10001fac0:     	adrp	x0, 0x100067000 <_write+0x100067000>
10001fac4:     	add	x0, x0, #0x5e8
10001fac8:     	mov	x1, x21
10001facc:     	bl	0x100002fd8 <_afail>
10001fad0:     	mov	x1, x23
10001fad4:     	mov	x0, x24
10001fad8:     	and	w20, w22, #0xffff
10001fadc:     	ldr	w8, [x26, #0x8e0]
10001fae0:     	cbnz	w8, 0x10001f77c <_ajstring+0xfc>
10001fae4:     	ldp	x8, x9, [x0, #0x28]
10001fae8:     	cmp	x25, x9
10001faec:     	b.ne	0x10001f8c0 <_ajstring+0x240>
10001faf0:     	lsl	x1, x25, #2
10001faf4:     	mov	x0, x8
10001faf8:     	bl	0x100053a60 <_write+0x100053a60>
10001fafc:     	cbz	x0, 0x10001fbb4 <_ajstring+0x534>
10001fb00:     	mov	x8, x0
10001fb04:     	lsl	x9, x25, #1
10001fb08:     	mov	x0, x24
10001fb0c:     	stp	x8, x9, [x24, #0x28]
10001fb10:     	mov	x1, x23
10001fb14:     	b	0x10001f8c0 <_ajstring+0x240>
10001fb18:     	ldrh	w9, [x10, x13, lsl #1]
10001fb1c:     	sub	w10, w9, #0x30
10001fb20:     	cmp	w10, #0xa
10001fb24:     	b.hs	0x10001fb30 <_ajstring+0x4b0>
10001fb28:     	mov	w10, #-0x30             ; =-48
10001fb2c:     	b	0x10001fb60 <_ajstring+0x4e0>
10001fb30:     	sub	w10, w9, #0x61
10001fb34:     	cmp	w10, #0x6
10001fb38:     	b.hs	0x10001fb4c <_ajstring+0x4cc>
10001fb3c:     	cmp	w9, #0x57
10001fb40:     	b.lo	0x10001fabc <_ajstring+0x43c>
10001fb44:     	mov	w10, #-0x57             ; =-87
10001fb48:     	b	0x10001fb5c <_ajstring+0x4dc>
10001fb4c:     	sub	w10, w9, #0x47
10001fb50:     	cmn	w10, #0x6
10001fb54:     	b.lo	0x10001fabc <_ajstring+0x43c>
10001fb58:     	mov	w10, #-0x37             ; =-55
10001fb5c:     	mov	x0, x24
10001fb60:     	add	x8, x8, #0x6
10001fb64:     	str	x8, [x0, #0x10]
10001fb68:     	add	w8, w10, w9
10001fb6c:     	add	w22, w8, w22, lsl #4
10001fb70:     	b	0x10001fad8 <_ajstring+0x458>
10001fb74:     	mov	x22, x25
10001fb78:     	ldr	w8, [x26, #0x8e0]
10001fb7c:     	cbnz	w8, 0x10001f77c <_ajstring+0xfc>
10001fb80:     	b	0x10001fbd8 <_ajstring+0x558>
10001fb84:     	mov	x22, x25
10001fb88:     	b	0x10001fbf8 <_ajstring+0x578>
10001fb8c:     	adrp	x0, 0x100067000 <_write+0x100067000>
10001fb90:     	add	x0, x0, #0x5e8
10001fb94:     	adrp	x1, 0x100067000 <_write+0x100067000>
10001fb98:     	add	x1, x1, #0x55f
10001fb9c:     	b	0x10001fbc4 <_ajstring+0x544>
10001fba0:     	adrp	x0, 0x100067000 <_write+0x100067000>
10001fba4:     	add	x0, x0, #0x5e8
10001fba8:     	adrp	x1, 0x100067000 <_write+0x100067000>
10001fbac:     	add	x1, x1, #0x581
10001fbb0:     	b	0x10001fbc4 <_ajstring+0x544>
10001fbb4:     	adrp	x0, 0x100067000 <_write+0x100067000>
10001fbb8:     	add	x0, x0, #0x5e8
10001fbbc:     	adrp	x1, 0x100067000 <_write+0x100067000>
10001fbc0:     	add	x1, x1, #0x5cb
10001fbc4:     	add	x8, sp, #0x8
10001fbc8:     	bl	0x100002fd8 <_afail>
10001fbcc:     	mov	x22, x25
10001fbd0:     	ldr	w8, [x26, #0x8e0]
10001fbd4:     	cbnz	w8, 0x10001f77c <_ajstring+0xfc>
10001fbd8:     	adrp	x0, 0x100067000 <_write+0x100067000>
10001fbdc:     	add	x0, x0, #0x5e8
10001fbe0:     	adrp	x1, 0x100067000 <_write+0x100067000>
10001fbe4:     	add	x1, x1, #0x549
10001fbe8:     	add	x8, sp, #0x8
10001fbec:     	bl	0x100002fd8 <_afail>
10001fbf0:     	mov	x0, x24
10001fbf4:     	mov	x1, x23
10001fbf8:     	ldr	w8, [x26, #0x8e0]
10001fbfc:     	cbnz	w8, 0x10001f77c <_ajstring+0xfc>
10001fc00:     	ldr	x9, [x0, #0x28]
10001fc04:     	mov	x8, x19
10001fc08:     	mov	x3, x1
10001fc0c:     	mov	x1, x9
10001fc10:     	mov	x2, x22
10001fc14:     	b	0x10001f804 <_ajstring+0x184>
10001fc18:     	adrp	x0, 0x100067000 <_write+0x100067000>
10001fc1c:     	add	x0, x0, #0x5e8
10001fc20:     	adrp	x1, 0x100067000 <_write+0x100067000>
10001fc24:     	add	x1, x1, #0x5b6
10001fc28:     	b	0x10001fbc4 <_ajstring+0x544>
10001fc2c:     	bl	0x100052484 <_autf8bytes.cold.1>
