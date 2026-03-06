import Image from "next/image";
import React from "react";

const features = [
  {
    title: "Collect user feedback",
    description:
      "Use your Insighto's board to let users submit features they want.",
    styles: "bg-primary text-primary-content",
    demo: (
      <div className="flex h-full items-stretch overflow-hidden">
        <div className="bg-base-200 rounded-t-box h-full w-full translate-x-12 p-6">
          <p className="text-base-content/60 mb-3 text-sm font-medium tracking-wide uppercase">
            Suggest a feature
          </p>
          <div className="textarea bg-base-200 group-hover:bg-base-100 group-hover:border-base-content/10 text-base-content relative mr-12 h-full py-4">
            <div className="absolute top-4 left-4 flex items-center group-hover:hidden">
              <span>Notifica</span>
              <span className="bg-primary h-6 w-[2px] animate-pulse"></span>
            </div>
            <div className="opacity-0 duration-500 group-hover:opacity-100">
              Notifications should be visible only on certain pages.
            </div>
            <div className="flex items-center gap-0.5 opacity-0 duration-1000 group-hover:opacity-100">
              <span>Terms & privacy pages don&apos;t need them</span>
              <span className="bg-primary h-6 w-[2px] animate-pulse"></span>
            </div>
            <button className="btn btn-primary absolute right-4 bottom-6 opacity-0 shadow-lg duration-1000 group-hover:opacity-100">
              Submit
            </button>
          </div>
        </div>
      </div>
    ),
  },
  {
    title: "Prioritize features",
    description: "Users upvote features they want. You know what to ship next.",
    styles: "md:col-span-2 bg-base-300 text-base-content",
    demo: (
      <div className="flex max-w-[600px] flex-col gap-4 overflow-hidden px-6">
        {[
          {
            text: "Add LemonSqueezy integration to the boilerplate",
            secondaryText: "Yes, ship this! ✅",
            votes: 48,
            transition: "group-hover:-mt-36 group-hover:md:-mt-28 duration-500",
          },
          {
            text: "A new pricing table for metered billing",
            secondaryText: "Maybe ship this 🤔",
            votes: 12,
          },
          {
            text: "A new UI library for the dashboard",
            secondaryText: "But don't ship that ❌",
            votes: 1,
          },
        ].map((feature, i) => (
          <div
            className={`bg-base-100 text-base-content rounded-box mb-2 flex justify-between gap-4 p-4 ${feature?.transition}`}
            key={i}
          >
            <div>
              <p className="mb-1 font-semibold">{feature.text}</p>
              <p className="text-base-content-secondary">
                {feature.secondaryText}
              </p>
            </div>
            <button
              className={`rounded-box group bg-primary text-primary-content border border-transparent px-4 py-2 text-center text-lg duration-150`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`h-5 w-5 -translate-y-0.5 duration-150 ease-in-out group-hover:translate-y-0`}
              >
                <path d="m18 15-6-6-6 6" />
              </svg>
              {feature.votes}
            </button>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: "Your brand, your board",
    description: "Customize your Insighto board with 7 themes.",
    styles: "md:col-span-2 bg-base-100 text-base-content",
    demo: (
      <div className="left-0 -mt-4 flex h-full w-full overflow-hidden pt-0 lg:pt-8">
        <div className="flex h-full min-w-max -rotate-[8deg] overflow-x-visible lg:pt-4">
          {[
            {
              buttonStyles: "bg-primary text-primary-content",
              css: "-ml-1 rotate-[6deg] w-72 h-72 z-30 bg-base-200 text-base-content rounded-2xl group-hover:-ml-64 group-hover:opacity-0 group-hover:scale-75 transition-all duration-500 p-4",
            },
            {
              buttonStyles: "bg-secondary text-secondary-content",
              css: "rotate-[6deg] bg-base-200 text-base-content w-72 h-72 -mr-20 -ml-20 z-20 rounded-xl p-4",
            },
            {
              buttonStyles: "bg-accent text-accent-content",
              css: "rotate-[6deg] bg-base-200 text-base-content z-10 w-72 h-72 rounded-xl p-4",
            },
            {
              buttonStyles: "bg-neutral text-neutral-content",
              css: "rotate-[6deg] bg-base-200 text-base-content w-72 h-72 -ml-20 rounded-xl p-4",
            },
            {
              buttonStyles: "bg-base-100 text-base-content",
              css: "rotate-[6deg] bg-base-200 text-base-content w-72 h-72 -ml-10 -z-10 rounded-xl p-4 opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100 transition-all duration-300",
            },
          ].map((theme, i) => (
            <div className={theme.css} key={i}>
              <div className="text-base-content/60 mb-3 text-sm font-medium tracking-wide uppercase">
                Trending feedback
              </div>
              <div className="space-y-2">
                <div className="bg-base-100 rounded-box flex justify-between p-4">
                  <div>
                    <p className="mb-1 font-semibold">Clickable cards</p>
                    <p className="opacity-80">Make cards more accessible</p>
                  </div>
                  <button
                    className={`rounded-box group border border-transparent px-4 py-2 text-center text-lg duration-150 ${theme.buttonStyles}`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`h-5 w-5 -translate-y-0.5 duration-150 ease-in-out group-hover:translate-y-0`}
                    >
                      <path d="m18 15-6-6-6 6" />
                    </svg>
                    8
                  </button>
                </div>
                <div className="bg-base-100 rounded-box flex justify-between p-4">
                  <div>
                    <p className="mb-1 font-semibold">Bigger images</p>
                    <p className="opacity-80">Make cards more accessible</p>
                  </div>
                  <button
                    className={`rounded-box group border border-transparent px-4 py-2 text-center text-lg duration-150 ${theme.buttonStyles}`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`h-5 w-5 -translate-y-0.5 duration-150 ease-in-out group-hover:translate-y-0`}
                    >
                      <path d="m18 15-6-6-6 6" />
                    </svg>
                    5
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    title: "Discover new ideas",
    description: "Users can chat and discuss features.",
    styles: "bg-neutral text-neutral-content",
    demo: (
      <div className="text-neutral-content space-y-4 px-6">
        {[
          {
            id: 1,
            text: "Can we have a feature to add a custom domain to IndiePage?",
            userImg:
              "https://pbs.twimg.com/profile_images/1514863683574599681/9k7PqDTA_400x400.jpg",
            userName: "Marc Lou",
            createdAt: "2024-09-01T00:00:00Z",
          },
          {
            id: 2,
            text: "I'd definitelly pay for that 🤩",
            userImg:
              "https://pbs.twimg.com/profile_images/1778434561556320256/knBJT1OR_400x400.jpg",
            userName: "Dan K.",
            createdAt: "2024-09-02T00:00:00Z",
            transition:
              "opacity-0 group-hover:opacity-100 duration-500 translate-x-1/4 group-hover:translate-x-0",
          },
        ]?.map((reply) => (
          <div
            key={reply.id}
            className={`bg-neutral-content text-neutral rounded-box px-6 py-4 ${reply?.transition}`}
          >
            <div className="mb-2 whitespace-pre-wrap">{reply.text}</div>
            <div className="text-neutral/80 flex items-center gap-2 text-sm">
              <div className="flex items-center gap-2">
                <div className="avatar">
                  <div className="w-7 rounded-full">
                    <Image
                      src={reply.userImg}
                      alt={reply.userName}
                      width={28}
                      height={28}
                      sizes="28px"
                      className="h-7 w-7 object-cover"
                    />
                  </div>
                </div>
                <div className=""> {reply.userName} </div>
              </div>
              •
              <div>
                {new Date(reply.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    ),
  },
];
const FeaturesGrid = () => {
  return (
    <section className="bg-base-200/50 text-base-content flex w-full items-center justify-center py-20 lg:py-32">
      <div className="flex max-w-[82rem] flex-col gap-16 px-4 md:gap-20">
        <h2 className="max-w-3xl text-4xl font-black tracking-[-0.01em] md:text-6xl">
          Ship features <br /> users{" "}
          <span className="decoration-base-300 underline decoration-dashed underline-offset-8">
            really want
          </span>
        </h2>
        <div className="text-text-default flex h-fit w-full max-w-[82rem] flex-col gap-4 lg:gap-10">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:gap-10">
            {features.map((feature) => (
              <div
                key={feature.title}
                className={`${feature.styles} group flex h-[22rem] w-full flex-col gap-6 overflow-hidden rounded-3xl pt-6 lg:h-[25rem]`}
              >
                <div className="space-y-2 px-6">
                  <h3 className="text-xl font-bold tracking-tight lg:text-3xl">
                    {feature.title}
                  </h3>
                  <p className="opacity-80">{feature.description}</p>
                </div>
                {feature.demo}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default FeaturesGrid;
