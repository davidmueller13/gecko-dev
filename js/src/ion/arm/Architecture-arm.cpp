/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 * vim: set ts=4 sw=4 et tw=99:
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#define HWCAP_ARMv7 (1 << 31)
#include <mozilla/StandardInteger.h>

#include <sys/types.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <elf.h>

// lame check for kernel version
// see bug 586550
#ifndef WTF_OS_ANDROID
#include <asm/hwcap.h>
#endif
#include "ion/arm/Architecture-arm.h"
#include "ion/arm/Assembler-arm.h"
namespace js {
namespace ion {

uint32_t getFlags()
{
    static bool isSet = false;
    static uint32_t flags = 0;
    if (isSet)
        return flags;

#if WTF_OS_LINUX
    int fd = open("/proc/self/auxv", O_RDONLY);
    if (fd > 0) {
        Elf32_auxv_t aux;
        while (read(fd, &aux, sizeof(Elf32_auxv_t))) {
            if (aux.a_type == AT_HWCAP) {
                close(fd);
                flags = aux.a_un.a_val;
                isSet = true;
#ifdef __ARM_ARCH_7__
                // this should really be detected at runtime, but
                // /proc/*/auxv doesn't seem to carry the ISA
                // I could look in /proc/cpuinfo as well, but
                // the chances that it will be different from this
                // are low.
                flags |= HWCAP_ARMv7;
#endif
                return flags;
            }
        }
        close(fd);
    }
#elif defined(WTF_OS_ANDROID)
    FILE *fp = fopen("/proc/cpuinfo", "r");
    if (!fp)
        return false;

    char buf[1024];
    fread(buf, sizeof(char), sizeof(buf), fp);
    fclose(fp);
    if (strstr(buf, "vfp"))
        flags |= HWCAP_VFP;

    if (strstr(buf, "vfpv3"))
        flags |= HWCAP_VFPv3;

    if (strstr(buf, "vfpv3d16"))
        flags |= HWCAP_VFPv3;

    if (strstr(buf, "vfpv4"))
        flags |= HWCAP_VFPv4;

    if (strstr(buf, "idiva"))
        flags |= HWCAP_IDIVA;

    if (strstr(buf, "idivt"))
        flags |= HWCAP_IDIVT;

    if (strstr(buf, "neon"))
        flags |= HWCAP_NEON;

    // not part of the HWCAP flag, but I need to know this, and we're not using
    //  that bit, so... I'm using it
    if (strstr(buf, "ARMv7"))
        flags |= HWCAP_ARMv7;

    isSet = true;
    return flags;
#endif

    return false;
}

bool hasMOVWT()
{
    return js::ion::getFlags() & HWCAP_ARMv7;
}
bool hasVFPv3()
{
    return js::ion::getFlags() & HWCAP_VFPv3;
}
bool hasVFP()
{
    return js::ion::getFlags() & HWCAP_VFP;
}

bool has16DP()
{
    return js::ion::getFlags() & HWCAP_VFPv3D16 && !(js::ion::getFlags() & HWCAP_NEON);
}
bool useConvReg()
{
    return !has16DP();
}

} // namespace ion
} // namespace js

