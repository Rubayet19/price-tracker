import Link from "next/link";
import Image from "next/image";
import config from "@/config";
import logo from "@/app/icon.png";

// Add the Footer to the bottom of your landing page and more.
// The support link is connected to the config.js file. If there's no config.resend.supportEmail, the link won't be displayed.

const Footer = () => {
  return (
    <footer className="bg-base-200 border-base-content/10 border-t">
      <div className="mx-auto max-w-7xl px-8 py-24">
        <div className="flex flex-col flex-wrap md:flex-row md:flex-nowrap lg:items-start">
          <div className="mx-auto w-64 flex-shrink-0 text-center md:mx-0 md:text-left">
            <Link
              href="/#"
              aria-current="page"
              className="flex items-center justify-center gap-2 md:justify-start"
            >
              <Image
                src={logo}
                alt={`${config.appName} logo`}
                priority={true}
                className="h-6 w-6"
                width={24}
                height={24}
              />
              <strong className="text-base font-extrabold tracking-tight md:text-lg">
                {config.appName}
              </strong>
            </Link>

            <p className="text-base-content/80 mt-3 text-sm">
              {config.appDescription}
            </p>
            <p className="text-base-content/60 mt-3 text-sm">
              Copyright © {new Date().getFullYear()} - All rights reserved
            </p>

            <a
              href="https://shipfa.st/?ref=shipfast_badge"
              title="Go to ShipFast"
              target="_blank"
              className="bg-neutral text-neutral-content ring-base-content/10 hover:ring-neutral mt-4 inline-block cursor-pointer rounded px-2 py-1 text-sm ring-1 duration-200"
            >
              <div className="flex items-center gap-1">
                <span className="opacity-90">Built with</span>
                <span className="flex items-center gap-0.5 font-semibold tracking-tight">
                  <svg
                    className="size-5"
                    viewBox="0 0 375 509"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M233.962 11.7151L233.954 11.7229L186.393 57.3942L186.392 57.3948C116.335 124.657 57.1377 202.349 10.9069 287.707L10.8624 287.789L10.8164 287.87C10.5281 288.38 10.3791 288.954 10.383 289.537C10.387 290.12 10.5438 290.693 10.839 291.198C11.1342 291.704 11.5582 292.125 12.0701 292.419C12.5819 292.713 13.1633 292.868 13.756 292.869H129.042H139.042V302.869V494.875V494.888C139.042 495.535 139.229 496.17 139.584 496.715L131.361 502.072L139.584 496.715C139.939 497.26 140.447 497.692 141.048 497.957C141.648 498.222 142.314 498.308 142.963 498.202C143.613 498.096 144.215 497.804 144.698 497.365L144.7 497.363L165.966 477.999L165.97 477.996C239.677 410.959 302.226 332.637 351.272 245.969L351.274 245.966L364.435 222.73L364.44 222.721L364.445 222.712C364.735 222.203 364.885 221.627 364.882 221.043C364.879 220.459 364.723 219.886 364.427 219.379C364.132 218.872 363.707 218.45 363.194 218.156C362.681 217.862 362.099 217.707 361.505 217.707H361.5H249.685H239.685V207.707V14.1248C239.685 13.47 239.492 12.8285 239.129 12.28M233.962 11.7151L239.129 12.28M233.962 11.7151C234.438 11.2571 235.04 10.9473 235.694 10.8267C236.349 10.7061 237.024 10.7805 237.635 11.0399C238.246 11.2993 238.765 11.7314 239.129 12.28M233.962 11.7151L247.465 6.75675L239.129 12.28"
                      fill="#FFBE18"
                      stroke="black"
                      strokeWidth="20"
                    />
                  </svg>
                  ShipFast
                </span>
              </div>
            </a>
          </div>
          <div className="mt-10 -mb-10 flex flex-grow flex-wrap justify-center text-center md:mt-0">
            <div className="w-full px-4 md:w-1/2 lg:w-1/3">
              <div className="footer-title text-base-content mb-3 text-sm font-semibold tracking-widest md:text-left">
                LINKS
              </div>

              <div className="mb-10 flex flex-col items-center justify-center gap-2 text-sm md:items-start">
                {config.resend.supportEmail && (
                  <a
                    href={`mailto:${config.resend.supportEmail}`}
                    target="_blank"
                    className="link link-hover"
                    aria-label="Contact Support"
                  >
                    Support
                  </a>
                )}
                <Link href="/#pricing" className="link link-hover">
                  Pricing
                </Link>
                <Link href="/blog" className="link link-hover">
                  Blog
                </Link>
                <a href="/#" target="_blank" className="link link-hover">
                  Affiliates
                </a>
              </div>
            </div>

            <div className="w-full px-4 md:w-1/2 lg:w-1/3">
              <div className="footer-title text-base-content mb-3 text-sm font-semibold tracking-widest md:text-left">
                LEGAL
              </div>

              <div className="mb-10 flex flex-col items-center justify-center gap-2 text-sm md:items-start">
                <Link href="/tos" className="link link-hover">
                  Terms of services
                </Link>
                <Link href="/privacy-policy" className="link link-hover">
                  Privacy policy
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
