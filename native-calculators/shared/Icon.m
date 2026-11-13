#import <Cocoa/Cocoa.h>
// Build-time vector artwork. No image assets or runtime dependencies.
int main(int argc, const char **argv) {
    @autoreleasepool {
        if(argc!=3) return 1;
        NSString *directory=@(argv[1]); NSInteger index=[@(argv[2]) integerValue];
        NSArray *colors=@[[NSColor colorWithSRGBRed:0.15 green:0.44 blue:0.69 alpha:1],[NSColor colorWithSRGBRed:0.12 green:0.53 blue:0.42 alpha:1],[NSColor colorWithSRGBRed:0.40 green:0.31 blue:0.71 alpha:1],[NSColor colorWithSRGBRed:0.20 green:0.29 blue:0.39 alpha:1],[NSColor colorWithSRGBRed:0.66 green:0.35 blue:0.12 alpha:1],[NSColor colorWithSRGBRed:0.60 green:0.24 blue:0.43 alpha:1]];
        NSArray *symbols=@[@"+",@"%",@"π",@"01",@"$",@"⅓"];
        [NSFileManager.defaultManager createDirectoryAtPath:directory withIntermediateDirectories:YES attributes:nil error:nil];
        for(NSNumber *base in @[@16,@32,@128,@256,@512]) for(int scale=1;scale<=2;scale++) {
            NSInteger n=base.integerValue*scale;
            NSBitmapImageRep *bitmap=[[NSBitmapImageRep alloc] initWithBitmapDataPlanes:NULL pixelsWide:n pixelsHigh:n bitsPerSample:8 samplesPerPixel:4 hasAlpha:YES isPlanar:NO colorSpaceName:NSDeviceRGBColorSpace bytesPerRow:0 bitsPerPixel:0];
            [NSGraphicsContext saveGraphicsState]; [NSGraphicsContext setCurrentContext:[NSGraphicsContext graphicsContextWithBitmapImageRep:bitmap]];
            NSAffineTransform *transform=[NSAffineTransform transform]; [transform scaleBy:(CGFloat)n/1024]; [transform concat];
            [colors[index%6] setFill]; [[NSBezierPath bezierPathWithRoundedRect:NSMakeRect(72,72,880,880) xRadius:190 yRadius:190] fill];
            [[NSColor colorWithWhite:1 alpha:0.15] setFill]; [[NSBezierPath bezierPathWithRoundedRect:NSMakeRect(176,580,672,252) xRadius:42 yRadius:42] fill];
            NSString *symbol=symbols[index%6]; NSDictionary *attributes=@{NSFontAttributeName:[NSFont systemFontOfSize:210 weight:NSFontWeightLight],NSForegroundColorAttributeName:NSColor.whiteColor}; NSSize size=[symbol sizeWithAttributes:attributes]; [symbol drawAtPoint:NSMakePoint((1024-size.width)/2,588) withAttributes:attributes];
            [[NSColor colorWithWhite:1 alpha:0.88] setFill]; for(int row=0;row<2;row++) for(int column=0;column<3;column++) [[NSBezierPath bezierPathWithRoundedRect:NSMakeRect(198+column*222,212+row*172,184,126) xRadius:28 yRadius:28] fill];
            [NSGraphicsContext restoreGraphicsState];
            NSString *name=[NSString stringWithFormat:@"icon_%ldx%ld%@.png",(long)base.integerValue,(long)base.integerValue,scale==2 ? @"@2x" : @""];
            if(![[bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}] writeToFile:[directory stringByAppendingPathComponent:name] atomically:YES]) return 2;
        }
    } return 0;
}
