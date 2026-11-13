
.build/native-fastpaths-2026-11-13/json-simd/before:	file format mach-o arm64

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
10001f6a4:     	ldp	x8, x10, [x0, #0x8]
10001f6a8:     	cmp	x10, x8
10001f6ac:     	b.hs	0x10001f70c <_ajstring+0x8c>
10001f6b0:     	ldr	x9, [x0]
10001f6b4:     	add	x20, x10, #0x1
10001f6b8:     	str	x20, [x0, #0x10]
10001f6bc:     	ldrh	w10, [x9, x10, lsl #1]
10001f6c0:     	cmp	w10, #0x22
10001f6c4:     	b.ne	0x10001f70c <_ajstring+0x8c>
10001f6c8:     	cmp	x20, x8
10001f6cc:     	b.hs	0x10001f754 <_ajstring+0xd4>
10001f6d0:     	mov	w11, #0x2               ; =2
10001f6d4:     	mov	x10, x20
10001f6d8:     	ldrh	w12, [x9, x10, lsl #1]
10001f6dc:     	cmp	w12, #0x22
10001f6e0:     	b.eq	0x10001fac4 <_ajstring+0x444>
10001f6e4:     	cmp	w12, #0x5c
10001f6e8:     	b.eq	0x10001f758 <_ajstring+0xd8>
10001f6ec:     	cmp	w12, #0x20
10001f6f0:     	b.lo	0x10001f758 <_ajstring+0xd8>
10001f6f4:     	add	x10, x10, #0x1
10001f6f8:     	str	x10, [x0, #0x10]
10001f6fc:     	add	x11, x11, #0x1
10001f700:     	cmp	x8, x10
10001f704:     	b.ne	0x10001f6d8 <_ajstring+0x58>
10001f708:     	b	0x10001f760 <_ajstring+0xe0>
10001f70c:     	adrp	x0, 0x100067000 <_write+0x100067000>
10001f710:     	add	x0, x0, #0x57a
10001f714:     	adrp	x1, 0x100067000 <_write+0x100067000>
10001f718:     	add	x1, x1, #0x4c5
10001f71c:     	add	x8, sp, #0x8
10001f720:     	bl	0x100002fd8 <_afail>
10001f724:     	stp	xzr, xzr, [x19]
10001f728:     	str	xzr, [x19, #0x10]
10001f72c:     	mov	w8, #0x1                ; =1
10001f730:     	str	w8, [x19]
10001f734:     	ldp	x29, x30, [sp, #0x70]
10001f738:     	ldp	x20, x19, [sp, #0x60]
10001f73c:     	ldp	x22, x21, [sp, #0x50]
10001f740:     	ldp	x24, x23, [sp, #0x40]
10001f744:     	ldp	x26, x25, [sp, #0x30]
10001f748:     	ldp	x28, x27, [sp, #0x20]
10001f74c:     	add	sp, sp, #0x80
10001f750:     	ret
10001f754:     	mov	x10, x20
10001f758:     	cmp	x10, x8
10001f75c:     	b.ne	0x10001f774 <_ajstring+0xf4>
10001f760:     	adrp	x0, 0x100067000 <_write+0x100067000>
10001f764:     	add	x0, x0, #0x57a
10001f768:     	adrp	x1, 0x100067000 <_write+0x100067000>
10001f76c:     	add	x1, x1, #0x4db
10001f770:     	b	0x10001f71c <_ajstring+0x9c>
10001f774:     	sub	x25, x10, x20
10001f778:     	ldr	x8, [x0, #0x30]
10001f77c:     	add	x9, x25, #0x1
10001f780:     	cmp	x8, x9
10001f784:     	mov	x23, x1
10001f788:     	mov	x24, x0
10001f78c:     	b.hs	0x10001f7c4 <_ajstring+0x144>
10001f790:     	add	x21, x25, #0x40
10001f794:     	ldr	x0, [x0, #0x28]
10001f798:     	bl	0x1000537a0 <_write+0x1000537a0>
10001f79c:     	lsl	x8, x21, #1
10001f7a0:     	cmp	x8, #0x1
10001f7a4:     	csinc	x0, x8, xzr, hi
10001f7a8:     	mov	w1, #0x1                ; =1
10001f7ac:     	bl	0x10005365c <_write+0x10005365c>
10001f7b0:     	cbz	x0, 0x10001fbb8 <_ajstring+0x538>
10001f7b4:     	mov	x8, x0
10001f7b8:     	mov	x0, x24
10001f7bc:     	stp	x8, x21, [x24, #0x28]
10001f7c0:     	mov	x1, x23
10001f7c4:     	cbz	x25, 0x10001f7e8 <_ajstring+0x168>
10001f7c8:     	ldr	x8, [x0, #0x28]
10001f7cc:     	ldr	x9, [x0]
10001f7d0:     	add	x1, x9, x20, lsl #1
10001f7d4:     	lsl	x2, x25, #1
10001f7d8:     	mov	x0, x8
10001f7dc:     	bl	0x1000538a8 <_write+0x1000538a8>
10001f7e0:     	mov	x0, x24
10001f7e4:     	mov	x1, x23
10001f7e8:     	ldp	x9, x8, [x0, #0x8]
10001f7ec:     	adrp	x26, 0x100074000 <_amain_task+0x3ff0>
10001f7f0:     	cmp	x8, x9
10001f7f4:     	b.hs	0x10001fae4 <_ajstring+0x464>
10001f7f8:     	mov	w27, #0x1               ; =1
10001f7fc:     	mov	x28, #0x2001            ; =8193
10001f800:     	movk	x28, #0x400, lsl #48
10001f804:     	adrp	x21, 0x100067000 <_write+0x100067000>
10001f808:     	add	x21, x21, #0x52b
10001f80c:     	b	0x10001f83c <_ajstring+0x1bc>
10001f810:     	mov	x8, x0
10001f814:     	lsl	x9, x25, #1
10001f818:     	mov	x0, x24
10001f81c:     	stp	x8, x9, [x24, #0x28]
10001f820:     	mov	x1, x23
10001f824:     	add	x22, x25, #0x1
10001f828:     	strh	w20, [x8, x25, lsl #1]
10001f82c:     	ldp	x9, x8, [x0, #0x8]
10001f830:     	mov	x25, x22
10001f834:     	cmp	x8, x9
10001f838:     	b.hs	0x10001fae8 <_ajstring+0x468>
10001f83c:     	ldr	x10, [x0]
10001f840:     	add	x12, x8, #0x1
10001f844:     	str	x12, [x0, #0x10]
10001f848:     	ldrh	w20, [x10, x8, lsl #1]
10001f84c:     	cmp	w20, #0x22
10001f850:     	b.eq	0x10001faf4 <_ajstring+0x474>
10001f854:     	cmp	w20, #0x1f
10001f858:     	b.ls	0x10001fafc <_ajstring+0x47c>
10001f85c:     	cmp	w20, #0x5c
10001f860:     	b.ne	0x10001fa40 <_ajstring+0x3c0>
10001f864:     	cmp	x12, x9
10001f868:     	b.eq	0x10001fb10 <_ajstring+0x490>
10001f86c:     	add	x11, x8, #0x2
10001f870:     	str	x11, [x0, #0x10]
10001f874:     	ldrh	w20, [x10, x12, lsl #1]
10001f878:     	cmp	w20, #0x65
10001f87c:     	b.le	0x10001f8b0 <_ajstring+0x230>
10001f880:     	cmp	w20, #0x71
10001f884:     	b.le	0x10001f8d8 <_ajstring+0x258>
10001f888:     	cmp	w20, #0x72
10001f88c:     	b.eq	0x10001f8f8 <_ajstring+0x278>
10001f890:     	cmp	w20, #0x74
10001f894:     	b.eq	0x10001f8f0 <_ajstring+0x270>
10001f898:     	cmp	w20, #0x75
10001f89c:     	b.ne	0x10001fba4 <_ajstring+0x524>
10001f8a0:     	cmp	x11, x9
10001f8a4:     	b.ne	0x10001f908 <_ajstring+0x288>
10001f8a8:     	mov	w22, #0x0               ; =0
10001f8ac:     	b	0x10001fa20 <_ajstring+0x3a0>
10001f8b0:     	sub	w8, w20, #0x22
10001f8b4:     	cmp	w8, #0x3a
10001f8b8:     	lsl	x8, x27, x8
10001f8bc:     	and	x8, x8, x28
10001f8c0:     	ccmp	x8, #0x0, #0x4, ls
10001f8c4:     	b.ne	0x10001fa40 <_ajstring+0x3c0>
10001f8c8:     	cmp	w20, #0x62
10001f8cc:     	b.ne	0x10001fba4 <_ajstring+0x524>
10001f8d0:     	mov	w20, #0x8               ; =8
10001f8d4:     	b	0x10001fa40 <_ajstring+0x3c0>
10001f8d8:     	cmp	w20, #0x66
10001f8dc:     	b.eq	0x10001f900 <_ajstring+0x280>
10001f8e0:     	cmp	w20, #0x6e
10001f8e4:     	b.ne	0x10001fba4 <_ajstring+0x524>
10001f8e8:     	mov	w20, #0xa               ; =10
10001f8ec:     	b	0x10001fa40 <_ajstring+0x3c0>
10001f8f0:     	mov	w20, #0x9               ; =9
10001f8f4:     	b	0x10001fa40 <_ajstring+0x3c0>
10001f8f8:     	mov	w20, #0xd               ; =13
10001f8fc:     	b	0x10001fa40 <_ajstring+0x3c0>
10001f900:     	mov	w20, #0xc               ; =12
10001f904:     	b	0x10001fa40 <_ajstring+0x3c0>
10001f908:     	ldrh	w11, [x10, x11, lsl #1]
10001f90c:     	sub	w12, w11, #0x30
10001f910:     	cmp	w12, #0xa
10001f914:     	b.hs	0x10001f948 <_ajstring+0x2c8>
10001f918:     	mov	w12, #-0x30             ; =-48
10001f91c:     	add	x13, x8, #0x3
10001f920:     	str	x13, [x0, #0x10]
10001f924:     	add	w22, w12, w11
10001f928:     	cmp	x13, x9
10001f92c:     	b.eq	0x10001fa20 <_ajstring+0x3a0>
10001f930:     	ldrh	w11, [x10, x13, lsl #1]
10001f934:     	sub	w12, w11, #0x30
10001f938:     	cmp	w12, #0xa
10001f93c:     	b.hs	0x10001f978 <_ajstring+0x2f8>
10001f940:     	mov	w12, #-0x30             ; =-48
10001f944:     	b	0x10001f9a8 <_ajstring+0x328>
10001f948:     	sub	w12, w11, #0x61
10001f94c:     	cmp	w12, #0x6
10001f950:     	b.hs	0x10001f964 <_ajstring+0x2e4>
10001f954:     	cmp	w11, #0x56
10001f958:     	b.ls	0x10001f8a8 <_ajstring+0x228>
10001f95c:     	mov	w12, #-0x57             ; =-87
10001f960:     	b	0x10001f91c <_ajstring+0x29c>
10001f964:     	sub	w12, w11, #0x47
10001f968:     	cmn	w12, #0x6
10001f96c:     	b.lo	0x10001f8a8 <_ajstring+0x228>
10001f970:     	mov	w12, #-0x37             ; =-55
10001f974:     	b	0x10001f91c <_ajstring+0x29c>
10001f978:     	sub	w12, w11, #0x61
10001f97c:     	cmp	w12, #0x6
10001f980:     	b.hs	0x10001f994 <_ajstring+0x314>
10001f984:     	cmp	w11, #0x57
10001f988:     	b.lo	0x10001fa20 <_ajstring+0x3a0>
10001f98c:     	mov	w12, #-0x57             ; =-87
10001f990:     	b	0x10001f9a4 <_ajstring+0x324>
10001f994:     	sub	w12, w11, #0x47
10001f998:     	cmn	w12, #0x6
10001f99c:     	b.lo	0x10001fa20 <_ajstring+0x3a0>
10001f9a0:     	mov	w12, #-0x37             ; =-55
10001f9a4:     	mov	x0, x24
10001f9a8:     	add	x13, x8, #0x4
10001f9ac:     	str	x13, [x0, #0x10]
10001f9b0:     	add	w11, w12, w11
10001f9b4:     	add	w22, w11, w22, lsl #4
10001f9b8:     	cmp	x13, x9
10001f9bc:     	b.eq	0x10001fa20 <_ajstring+0x3a0>
10001f9c0:     	ldrh	w11, [x10, x13, lsl #1]
10001f9c4:     	sub	w12, w11, #0x30
10001f9c8:     	cmp	w12, #0xa
10001f9cc:     	b.hs	0x10001f9d8 <_ajstring+0x358>
10001f9d0:     	mov	w12, #-0x30             ; =-48
10001f9d4:     	b	0x10001fa08 <_ajstring+0x388>
10001f9d8:     	sub	w12, w11, #0x61
10001f9dc:     	cmp	w12, #0x6
10001f9e0:     	b.hs	0x10001f9f4 <_ajstring+0x374>
10001f9e4:     	cmp	w11, #0x57
10001f9e8:     	b.lo	0x10001fa20 <_ajstring+0x3a0>
10001f9ec:     	mov	w12, #-0x57             ; =-87
10001f9f0:     	b	0x10001fa04 <_ajstring+0x384>
10001f9f4:     	sub	w12, w11, #0x47
10001f9f8:     	cmn	w12, #0x6
10001f9fc:     	b.lo	0x10001fa20 <_ajstring+0x3a0>
10001fa00:     	mov	w12, #-0x37             ; =-55
10001fa04:     	mov	x0, x24
10001fa08:     	add	x13, x8, #0x5
10001fa0c:     	str	x13, [x0, #0x10]
10001fa10:     	add	w11, w12, w11
10001fa14:     	add	w22, w11, w22, lsl #4
10001fa18:     	cmp	x13, x9
10001fa1c:     	b.ne	0x10001fa68 <_ajstring+0x3e8>
10001fa20:     	add	x8, sp, #0x8
10001fa24:     	adrp	x0, 0x100067000 <_write+0x100067000>
10001fa28:     	add	x0, x0, #0x57a
10001fa2c:     	mov	x1, x21
10001fa30:     	bl	0x100002fd8 <_afail>
10001fa34:     	mov	x1, x23
10001fa38:     	mov	x0, x24
10001fa3c:     	and	w20, w22, #0xffff
10001fa40:     	ldr	w8, [x26, #0x8e0]
10001fa44:     	cbnz	w8, 0x10001f724 <_ajstring+0xa4>
10001fa48:     	ldp	x8, x9, [x0, #0x28]
10001fa4c:     	cmp	x25, x9
10001fa50:     	b.ne	0x10001f824 <_ajstring+0x1a4>
10001fa54:     	lsl	x1, x25, #2
10001fa58:     	mov	x0, x8
10001fa5c:     	bl	0x1000539ec <_write+0x1000539ec>
10001fa60:     	cbnz	x0, 0x10001f810 <_ajstring+0x190>
10001fa64:     	b	0x10001fb24 <_ajstring+0x4a4>
10001fa68:     	ldrh	w9, [x10, x13, lsl #1]
10001fa6c:     	sub	w10, w9, #0x30
10001fa70:     	cmp	w10, #0xa
10001fa74:     	b.hs	0x10001fa80 <_ajstring+0x400>
10001fa78:     	mov	w10, #-0x30             ; =-48
10001fa7c:     	b	0x10001fab0 <_ajstring+0x430>
10001fa80:     	sub	w10, w9, #0x61
10001fa84:     	cmp	w10, #0x6
10001fa88:     	b.hs	0x10001fa9c <_ajstring+0x41c>
10001fa8c:     	cmp	w9, #0x57
10001fa90:     	b.lo	0x10001fa20 <_ajstring+0x3a0>
10001fa94:     	mov	w10, #-0x57             ; =-87
10001fa98:     	b	0x10001faac <_ajstring+0x42c>
10001fa9c:     	sub	w10, w9, #0x47
10001faa0:     	cmn	w10, #0x6
10001faa4:     	b.lo	0x10001fa20 <_ajstring+0x3a0>
10001faa8:     	mov	w10, #-0x37             ; =-55
10001faac:     	mov	x0, x24
10001fab0:     	add	x8, x8, #0x6
10001fab4:     	str	x8, [x0, #0x10]
10001fab8:     	add	w8, w10, w9
10001fabc:     	add	w22, w8, w22, lsl #4
10001fac0:     	b	0x10001fa3c <_ajstring+0x3bc>
10001fac4:     	add	x8, x10, #0x1
10001fac8:     	str	x8, [x0, #0x10]
10001facc:     	sub	x2, x11, #0x2
10001fad0:     	add	x9, x9, x20, lsl #1
10001fad4:     	mov	x8, x19
10001fad8:     	mov	x3, x1
10001fadc:     	mov	x1, x9
10001fae0:     	b	0x10001fb84 <_ajstring+0x504>
10001fae4:     	mov	x22, x25
10001fae8:     	ldr	w8, [x26, #0x8e0]
10001faec:     	cbnz	w8, 0x10001f724 <_ajstring+0xa4>
10001faf0:     	b	0x10001fb48 <_ajstring+0x4c8>
10001faf4:     	mov	x22, x25
10001faf8:     	b	0x10001fb68 <_ajstring+0x4e8>
10001fafc:     	adrp	x0, 0x100067000 <_write+0x100067000>
10001fb00:     	add	x0, x0, #0x57a
10001fb04:     	adrp	x1, 0x100067000 <_write+0x100067000>
10001fb08:     	add	x1, x1, #0x4f1
10001fb0c:     	b	0x10001fb34 <_ajstring+0x4b4>
10001fb10:     	adrp	x0, 0x100067000 <_write+0x100067000>
10001fb14:     	add	x0, x0, #0x57a
10001fb18:     	adrp	x1, 0x100067000 <_write+0x100067000>
10001fb1c:     	add	x1, x1, #0x513
10001fb20:     	b	0x10001fb34 <_ajstring+0x4b4>
10001fb24:     	adrp	x0, 0x100067000 <_write+0x100067000>
10001fb28:     	add	x0, x0, #0x57a
10001fb2c:     	adrp	x1, 0x100067000 <_write+0x100067000>
10001fb30:     	add	x1, x1, #0x55d
10001fb34:     	add	x8, sp, #0x8
10001fb38:     	bl	0x100002fd8 <_afail>
10001fb3c:     	mov	x22, x25
10001fb40:     	ldr	w8, [x26, #0x8e0]
10001fb44:     	cbnz	w8, 0x10001f724 <_ajstring+0xa4>
10001fb48:     	adrp	x0, 0x100067000 <_write+0x100067000>
10001fb4c:     	add	x0, x0, #0x57a
10001fb50:     	adrp	x1, 0x100067000 <_write+0x100067000>
10001fb54:     	add	x1, x1, #0x4db
10001fb58:     	add	x8, sp, #0x8
10001fb5c:     	bl	0x100002fd8 <_afail>
10001fb60:     	mov	x0, x24
10001fb64:     	mov	x1, x23
10001fb68:     	ldr	w8, [x26, #0x8e0]
10001fb6c:     	cbnz	w8, 0x10001f724 <_ajstring+0xa4>
10001fb70:     	ldr	x9, [x0, #0x28]
10001fb74:     	mov	x8, x19
10001fb78:     	mov	x3, x1
10001fb7c:     	mov	x1, x9
10001fb80:     	mov	x2, x22
10001fb84:     	ldp	x29, x30, [sp, #0x70]
10001fb88:     	ldp	x20, x19, [sp, #0x60]
10001fb8c:     	ldp	x22, x21, [sp, #0x50]
10001fb90:     	ldp	x24, x23, [sp, #0x40]
10001fb94:     	ldp	x26, x25, [sp, #0x30]
10001fb98:     	ldp	x28, x27, [sp, #0x20]
10001fb9c:     	add	sp, sp, #0x80
10001fba0:     	b	0x10001fbbc <_ajstring_value>
10001fba4:     	adrp	x0, 0x100067000 <_write+0x100067000>
10001fba8:     	add	x0, x0, #0x57a
10001fbac:     	adrp	x1, 0x100067000 <_write+0x100067000>
10001fbb0:     	add	x1, x1, #0x548
10001fbb4:     	b	0x10001fb34 <_ajstring+0x4b4>
10001fbb8:     	bl	0x100052410 <_autf8bytes.cold.1>
